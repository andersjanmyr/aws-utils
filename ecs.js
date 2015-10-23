#!/usr/bin/env node
"use strict";

var AWS = require('aws-sdk');
var sonyAwsProxyConfig = require('sony-aws-proxy-config');
AWS.config.update(sonyAwsProxyConfig());
var Promise = require('promise');
var _ = require('lodash');
var debug = require('debug')('ecs');
var util = require('util');
var parseArgs = require('minimist');

function patchAwsRequest() {
  AWS.Request.prototype.promise = function() {
    var that = this;
    return new Promise(function(accept, reject) {
      that.on('complete', function(response) {
        if (response.error) {
          reject(response.error);
        } else {
          accept(response);
        }
      });
      that.send();
    });
  };
};
patchAwsRequest();

function Cluster(data) {
    _.extend(this, data);
    this.instances = [];
    this.tasks = [];
    this.taskDefinitions = [];
}

Cluster.prototype.getData = function getData(format) {
    if (format === 'flat')
        return _.pick(this, ['clusterName', 'status', 'clusterArn']);
    else if (format === 'full')
        return {
            clusterName: this.clusterName,
            status: this.status,
            clusterArn: this.clusterArn,
            instances: this.instances,
            tasks: this.tasks
        }
    else
        return {
            clusterName: this.clusterName,
            status: this.status,
            instances: this.instances.map(function(instance) {
                return instance.getData(format);
            }),
            tasks: this.tasks.map(function(task) {
                return task.getData(format);
            }),
            taskDefinitions: this.taskDefinitions.map(function(taskDef) {
                return taskDef.getData(format);
            })
        }
}

Cluster.prototype.findInstance = function(containerInstanceArn) {
    return _.findWhere(this.instances, {containerInstanceArn: containerInstanceArn});
}

Cluster.prototype.getTasks = function getTasks(format) {
    return this.tasks.map(function(task) {
        var formattedTask = task.getData('simple');
        var instance = this.findInstance(task.containerInstanceArn);
        formattedTask.instance = instance.getData('basic');
        return formattedTask;
    }, this);
}

function Instance(data) {
   _.extend(this, data);
}

Instance.prototype.getData = function getData(format) {
    if (format === 'basic') {
        var data = this.getData('simple');
        delete data.containerInstanceArn;
        return data;
    }
    if (format === 'simple')
        return {
            ec2InstanceId: this.ec2InstanceId,
            PublicDnsName:
              (this.ec2Instance && this.ec2Instance.PublicDnsName)
                || 'NOT RUNNING',
            status: this.status,
            agentConnected: this.agentConnected,
            containerInstanceArn: this.containerInstanceArn,
        }
    return this;
}

function TaskDefinition(data) {
    this.data = data;
}

TaskDefinition.prototype.getData = function getData(format) {
    if (format === 'simple')
        return {
            family: this.data.family,
            revision: this.data.revision,
            containerDefinitions: _.pluck(this.data.containerDefinitions, 'name'),
            taskDefinitionArn: this.data.taskDefinitionArn
        }
    return this.data;
}

function Task(data) {
    _.extend(this, data);
}

Task.prototype.getData = function getData(format) {
    if (format === 'simple')
        return {
            name: this.containers[0].name,
            lastStatus: this.lastStatus,
            desiredStatus: this.desiredStatus,
            taskArn: this.taskArn.split('/')[1]
        }
    return this;
}


var ecs, ec2, clusterName;
function ecsWrapper(region, name) {
    debug('region', region);
    debug('cluster', clusterName);
    ecs = new AWS.ECS({region: region});
    ec2 = new AWS.EC2({region: region});
    clusterName = name;
    return {
        fetchModel: fetchModel
    };
}

function fetchModel(callback) {
    var allPromise = Promise.all([
        fetchCluster(ecs, clusterName),
        fetchInstances(ecs, ec2, clusterName),
        fetchTasks(ecs, clusterName)
    ]);
    allPromise.then(function(results) {
        var cluster = new Cluster(results[0]);
        cluster.instances = results[1];
        cluster.tasks = results[2];
        return fetchTaskDefinitions(ecs, cluster.tasks).then(function(taskDefinitions) {
            debug('taskDefinitions', taskDefinitions);
            cluster.taskDefinitions = taskDefinitions;
            return callback(null, cluster);
        });
    }).catch(function(err) {
        console.log('ERROR', err);
        return callback(err);
    });

}

function fetchCluster(ecs, clusterName) {
    debug('ecs', ecs);
    return ecs.describeClusters({clusters: [clusterName]}).promise().then(function(response) {
        return response.data.clusters[0];
    });
}


function fetchInstances(ecs, ec2, clusterName) {
    var instancesPromise = ecs.listContainerInstances({cluster: clusterName}).promise();
    return instancesPromise.then(function(response) {
        var instanceArns = response.data.containerInstanceArns;
        if (instanceArns.length === 0) return [];
        return ecs.describeContainerInstances({
            cluster: clusterName,
            containerInstances: instanceArns
        }).promise().then(function(response) {
            var containerInstances = response.data.containerInstances;
            return getEc2Instances(ec2, containerInstances);
        });
    });
}

function getEc2Instances(ec2, containerInstances) {
    var instanceIds = _.pluck(containerInstances, 'ec2InstanceId');
    var ec2Promise = ec2.describeInstances({InstanceIds: instanceIds}).promise();
    return ec2Promise.then(function(response) {
        var instances = _.flatten(_.pluck(response.data.Reservations, 'Instances'));
        containerInstances.forEach(function(ci) {
            ci.ec2Instance = _.findWhere(instances, {InstanceId: ci.ec2InstanceId});
        });

        return containerInstances.map(function(ci) {
            return new Instance(ci);
        });
    });
}

function fetchTasks(ecs, clusterName) {
    var tasksPromise = ecs.listTasks({cluster: clusterName}).promise();
    return tasksPromise.then(function(response) {
        var taskArns  = response.data.taskArns;
        if (taskArns.length === 0) return [];
        var describePromise = ecs.describeTasks({cluster: clusterName, tasks: taskArns}).promise();
        return describePromise.then(function(response) {
            debug('describeTasks', response.data);
            var tasks = response.data.tasks.map(function(task) {
                return new Task(task);
            });
            return tasks;
        });
    });
}

function fetchTaskDefinitions(ecs, tasks) {
    var taskDefArns = _.uniq(tasks.map(function(task) {
        return task.taskDefinitionArn;
    }));
    debug('fetchTaskDefinitions:taskDefArns', taskDefArns);
    var count = 0;
    var taskDefPromises = taskDefArns.map(function(taskDefArn) {
        var promise = ecs.describeTaskDefinition({taskDefinition: taskDefArn}).promise();
        return promise.then(function(response) {
            return new TaskDefinition(response.data.taskDefinition);
        });
    });
    return Promise.all(taskDefPromises);
}


function run(options) {
    var ecs = ecsWrapper(options.region, options.cluster);
    ecs.fetchModel(function(err, model) {
        var data = model.getData('simple');
        var out = {};
        if (options.tasks || options.t)
            out.tasks = model.getTasks();
        if (options.instances || options.i)
            out.instances = data.instances;
        if (options.taskdefs || options.d)
            out.taskDefinitions = data.taskDefinitions;

        if (Object.keys(out).length == 0)
            out = data;
        var output = util.inspect(out, {depth: null, colors: true});
        if(options.json || options.j)
          output = JSON.stringify(out, " ", 2);
        console.log(output);
    });
}

var args = parseArgs(process.argv.slice(2));
debug('ARGS', args);
if (!args.region)
    args.region = 'eu-west-1';
if (!args.cluster)
    args.cluster = 'unstable';

run(args);
