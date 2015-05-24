#!/usr/bin/env node

var AWS = require('aws-sdk');
var yargs = require('yargs');

var route53 = new AWS.Route53();

main();

var verbose = true;

function log() {
  if (verbose)
    console.log.apply(console, arguments);
}


function main() {
  var argv = parseArgs();
  argv.domain = getDomain(argv.hostname) || 'janmyr.com';
  if (argv.dry)
    return console.log(argv);
  verbose = argv.verbose;
  fetchZones(argv.domain, function(err, zones) {
    var zoneId = zones[0].id;
    if (argv.delete) {
      return removeRecord(zoneId, argv.hostname, function(err, result) {
        console.log(err, result);
      });
    }
    return addRecord(zoneId, argv.hostname, argv.target, function(err, result) {
      console.log(err, result);
    });
  });
}

function parseArgs() {
  var argv = yargs
    .usage('$0: [options] hostname [target]')
    .boolean('delete')
    .describe('delete', 'Delete the hostname instead of create')
    .boolean('dry')
    .describe('dry', "Don't do anything, show parameters and request")
    .boolean('verbose')
    .describe('verbose', 'verbose progress output')
    .demand(1)
    .argv;
  if (!argv.delete && argv._.length < 2) {
    yargs.showHelp();
    process.exit(1);
  }
  argv.hostname = argv._[0];
  argv.target = argv._[1];
  return argv;
}

function getDomain(hostname) {
  var arr = hostname.split('.');
  if (arr.length > 2)
    return arr.slice(1).join('.');
  return null;
}


function fetchZones(domain, callback) {
  log('Fetching zones', domain);
  route53.listHostedZones({}, function(err, data) {
    if (err)
      return callback(err);

    var zones = data.HostedZones;
    if (domain) {
      var zones = zones.filter(function(zone) {
        return zone.Name == domain + '.';
      });
    }
    var cleaned = zones.map(function(zone) {
      return {
        name: zone.Name.substring(0, zone.Name.length-1),
        id: zone.Id.split('/')[2]
      }
    });
    log('Zones', cleaned);
    return callback(null, cleaned);
  });
}

function addRecord(zoneId, hostname, target, callback) {
  log('addRecord', hostname, target);
  getRecord(zoneId, hostname, function (err, foundRecord) {
    log('foundRecord', foundRecord)
    if (err) return callback(err);
    var changeSet = createChangeSet(hostname);
    if (foundRecord)
      addChange('DELETE', changeSet, foundRecord);

    var record = createCnameRecord(hostname, target)
    addChange('CREATE', changeSet, record);
    updateRecords(zoneId, changeSet, callback);
  });
}


function getRecord(zoneId, hostname, callback) {
  log('getRecord', zoneId, hostname);
  listRecords(zoneId, function (error, zone) {
    if (error) return callback(error);
    var recordName = hostname + '.';
    var record = findRecordSet(zone.ResourceRecordSets, recordName);
    callback(null, record);
  });
}

function listRecords(zoneId, callback) {
  var params = {
    HostedZoneId: zoneId
  };
  route53.listResourceRecordSets(params, function (err, response) {
    callback(err, response);
  });

}

function removeRecord(zoneId, hostname, callback) {
  getRecord(zoneId, hostname, function (error, record) {
    if (error) return callback(error);
    if (!record) return callback('Record not found for hostname: ' + hostname);
    var changeSet = createChangeSet(hostname);
    addChange('DELETE', changeSet, record);
    updateRecords(zoneId, changeSet, callback);
  });
}

function findRecordSet(recordSets, name) {
  var foundSets = recordSets.filter(function (recordSet) {
    return recordSet.Name === name;
  });
  return foundSets[0] || null;
}

function createChangeSet(hostname) {
  return {
    Comment: 'Updated the DNS with ' + hostname,
    Changes: []
  };
}

function addChange(action, changeSet, record) {
  changeSet.Changes.push(createChange(action, record));
}

function createChange(action, record) {
  return {
    Action: action,
    ResourceRecordSet: record
  };
}

function createCnameRecord(hostname, cname) {
  var record = {
    Name: hostname,
    Type: 'CNAME',
    TTL: 60,
    ResourceRecords: [{Value: cname}]
  };

  log('createCnameRecord', record);
  return record;
}

function updateRecords(zoneId, changeSet, callback) {
  log('updateRecords', zoneId, changeSet);
  var params = {
    HostedZoneId: zoneId,
    ChangeBatch: changeSet
  };
  route53.changeResourceRecordSets(params, function (err, data) {
    if (err) return callback(err);
    return callback(null, data);
  });
}

