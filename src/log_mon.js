var follow = require('text-file-follower'),
    _ = require('lodash'),
    logParser = require('clf-parser'),
    testData = require('../test/test_data');

// TODO: consider using Path library
exports.getSectionFromUri = function(uri) {
  // set i is 1 to skip the first occurence of '/'
  for (var i = 1; i < uri.length; i++) {
    if (uri[i] === '/') {
      return uri.slice(0, i);
    }
  }
  return uri;
};

exports.LogMonitor = function(config) {
  this.DISREGARD_LOG_TIMESTAMP = config.ignoreOldTimestampLogs || false;
  this.RECOVERY_TYPE = "recover";
  this.BREACH_TYPE = "breach";
  this.ALARM_LOG_COUNT_THRESHOLD = config.alarmLogCountThreshold || 10;
  this.CACHED_LOG_RETENTION_SECONDS = config.logCacheRetentionTimeSeconds || 2 * 60;

  this.logFilePath = config.logFilePath;
  if (!this.logFilePath) {
    throw "Empty Log File Path! ";
  }

  this.logs = [];
  this.cachedApiSectionHits = {};
  this.trafficAlerts = [];
  this.errors = [];

  this.parseLogLine = function(line) {
    try {
      var parsed = logParser(line);
      var requestData = parsed.request.split(/ +/);
      parsed.method = requestData[0];
      parsed.path = requestData[1];
      parsed.section = exports.getSectionFromUri(parsed.path);
      this.cacheUriSectionHit(parsed.section);
      parsed.processed_at = new Date();
      return parsed;
    } catch (e) {
      this.errors.push(e);
      return null;
    }
  };

  this.cacheUriSectionHit = (section) => {
    if (this.cachedApiSectionHits[section]) {
      this.cachedApiSectionHits[section] = this.cachedApiSectionHits[section] + 1;
    } else {
      this.cachedApiSectionHits[section] = 1;
    }
  };

  this.getTopUriSections = () => {
    var asPairs = _.toPairs(this.cachedApiSectionHits);
    return _.sortBy(asPairs, (section) => {return -1 * section[1];});
  };

  this.clearCachedStats = () => {
    this.cachedApiSectionHits = [];
  };

  this.soundTheAlarm = () => {
    var self = this;
    this.trafficAlerts.push({type: this.BREACH_TYPE, alert_time: (new Date).toLocaleString(), hits: this.logs.length});
  };

  this.recoverFromAlarm = () => {
    this.trafficAlerts.push({type: this.RECOVERY_TYPE, alert_time: (new Date).toLocaleString(), hits: this.logs.length});
  };

  this.trafficAlertActive = () => {
    var previousAlert = this.trafficAlerts[this.trafficAlerts.length - 1];
    return previousAlert && previousAlert.type === this.BREACH_TYPE;
  };

  this.handleNewLogLine = (line, cbFn) => {
    const parsed = this.parseLogLine(line);
    if (parsed) {
      this.logs.push(parsed);
    }
  };

  this.postLogProcessing = () => {
    this.removeOldLogs();
    this.generateAlarmsOrRecovery();
  };

  this.removeOldLogs = () => {
    var limit = new Date();
    limit.setSeconds(limit.getSeconds() - this.CACHED_LOG_RETENTION_SECONDS);

    for (var i = this.logs.length - 1; i >= 0; i--) {
      var log = this.logs[i];
      var logDate = this.DISREGARD_LOG_TIMESTAMP ? log.processed_at : log.time_local;
      if (new Date(logDate) < limit) {
        this.logs.splice(i, 1);
      }
    }
  };

  this.generateAlarmsOrRecovery = () => {
    var trafficAlertActive = this.trafficAlertActive();
    if (trafficAlertActive) {
      if (this.logs.length < this.ALARM_LOG_COUNT_THRESHOLD) {
        this.recoverFromAlarm();
      } else {
        // Check back in a bit
        var self = this;
        setTimeout(() => {
          self.removeOldLogs();
          self.generateAlarmsOrRecovery();
        }, (self.CACHED_LOG_RETENTION_SECONDS * 1000) + 1);
      }
    } else if (this.logs.length >= this.ALARM_LOG_COUNT_THRESHOLD) {
      this.soundTheAlarm();
    }
  };

  this.makeLastNRequestsList = (n) => {
    if (this.logs.length === 0) {
      return [{'remote_addr': '', 'remote_user': '', 'time_local': '', 'request': ''}];
    } else {
      return _.takeRight(this.logs, n).map((line) => {
        return _.pick(line, 'remote_addr', 'remote_user', 'time_local', 'request');
      });
    }
  };

  this.start = () => {
    self = this;
    self.asyncProcessLogsLoop();

    this.follower = follow(this.logFilePath);
    this.follower.on('line', function(filename, line) {
      self.handleNewLogLine(line);
    });
  };

  this.asyncProcessLogsLoop = () => {
    self = this;
    setTimeout(() => {
      self.postLogProcessing();
      self.asyncProcessLogsLoop();
    }, 100);
  };
};

// // Stats
// var top_sections = [
//   {"section": "/api", "hits": 20},
//   {"section": "/users/", "hits": 10}
// ];
// var top_users = [
//   {"user": "john", "hits": 20},
//   {"user": "sally", "hits": 20},
// ];
// var stats = {"Section With Most Hits": "/api", "Most Active User": "John"};
