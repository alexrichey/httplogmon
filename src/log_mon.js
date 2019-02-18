var follow = require('text-file-follower'),
    fs = require('fs'),
    chalk = require('chalk'),
    _ = require('lodash'),
    logParser = require('clf-parser');


/**
 * Monitor for the specified log file. The file will be tailed and new log lines will be parsed
 * and cached. Old logs are removed from the cache asynchronously at a given interval.
 * Additionally, when logs are parsed, stats will be generated for certain topics like api sections hits.
 */
var LogMonitor = function(config) {
  this.DISREGARD_LOG_TIMESTAMP = config.ignoreOldTimestampLogs;
  this.ALARM_LOG_COUNT_THRESHOLD = config.alarmLogCountThreshold || 10;
  this.CACHED_LOG_RETENTION_SECONDS = config.logCacheRetentionTimeSeconds || 2 * 60;

  this.logFilePath = config.logFilePath;
  if (!this.logFilePath) {
    throw 'Empty Log File Path! ';
  } else if (!fs.existsSync(this.logFilePath)) {
    fs.writeFileSync(this.logFilePath, null);
  }

  this.RECOVERY_TYPE = 'recover';
  this.BREACH_TYPE = 'breach';

  // long term stats
  this.startTime;
  this.logs = [];
  this.trafficAlerts = [];
  this.errors = [];

  // cached stats
  this.shortTermHitCount = 0;
  this.cachedApiSectionHits = {};
  this.cachedUserHits = {};

  this.parseLogLine = function(line) {
    try {
      var parsed = logParser(line);
      var requestData = parsed.request.split(/ +/);
      parsed.method = requestData[0];
      parsed.path = requestData[1];
      parsed.section = this.getSectionFromUri(parsed.path);
      parsed.processed_at = new Date();
      return parsed;
    } catch (e) {
      this.errors.push(e);
      return null;
    }
  };

  /**
   * Returns the section (uri portion before the second slash) from a given uri
   * @param  {String} uri
   * @return {String} section
   */
  this.getSectionFromUri = (uri) => {
    // set i is 1 to skip the first occurence of '/'
    for (var i = 1; i < uri.length; i++) {
      if (uri[i] === '/') {
        return uri.slice(0, i);
      }
    }
    return uri;
  };

  this.cacheUserHit = (user) => {
    var cachedUserHits = this.cachedUserHits[user];
    this.cachedUserHits[user] = cachedUserHits ? cachedUserHits + 1 : 1;
  };

  this.cacheUriSectionHit = (section) => {
    var sectionHits = this.cachedApiSectionHits[section];
    this.cachedApiSectionHits[section] = sectionHits ? sectionHits + 1 : 1;
  };

  this.makeSortedHitCountPairs = (cachedSection) => {
    var asPairs = _.toPairs(cachedSection);
    return _.sortBy(asPairs, (pair) => {return -1 * pair[1];});
  };

  this.getTopUsersHits = (n) => {
    return _.take(this.makeSortedHitCountPairs(this.cachedUserHits), n);
  };

  this.getTopUriSections = (n) => {
    return _.take(this.makeSortedHitCountPairs(this.cachedApiSectionHits), n);
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

  this.clearCachedStats = () => {
    this.shortTermHitCount = 0;
    this.cachedApiSectionHits = {};
    this.cachedUserHits = {};
  };

  this.soundTheAlarm = () => {
    this.trafficAlerts.push({type: this.BREACH_TYPE, alert_time: (new Date).toLocaleString(), hits: this.logs.length});
  };

  this.recoverFromAlarm = () => {
    this.trafficAlerts.push({type: this.RECOVERY_TYPE, alert_time: (new Date).toLocaleString(), hits: this.logs.length});
  };

  this.trafficAlertActive = () => {
    var previousAlert = this.trafficAlerts[this.trafficAlerts.length - 1];
    return previousAlert && previousAlert.type === this.BREACH_TYPE;
  };

  /**
   * Print Traffic Alerts with the most recent first
   */
  this.printTrafficAlerts = () => {
    var trafficAlertsCopy = this.trafficAlerts.slice(0);
    var highTrafficAlerts = _.reverse(trafficAlertsCopy);
    return highTrafficAlerts.forEach(r => {
      if (r.type === this.BREACH_TYPE) {
        console.log(chalk.red(`High traffic generated an alert - hits = ${r.hits}, triggered at ${r.alert_time}`));
      } else {
        console.log(chalk.green(`Traffic levels have returned to normal, triggered at ${r.alert_time}`));
      }
    });
  };

  this.handleNewLogLine = (line, cbFn) => {
    const parsed = this.parseLogLine(line);
    if (parsed) {
      this.cacheUriSectionHit(parsed.section);
      this.cacheUserHit(parsed.remote_user);
      this.shortTermHitCount += 1;
      this.logs.push(parsed);
    }
  };

  this.postLogProcessing = () => {
    this.removeOldLogs();
    this.generateAlarmsOrRecovery();
  };

  /**
   * Removes logs that are past the long term retention datetime.
   * If DISREGARD_LOG_TIMESTAMP is true, use the time that the log was processed for comparison
   */
  this.removeOldLogs = () => {
    var limit = new Date();
    limit.setSeconds(limit.getSeconds() - this.CACHED_LOG_RETENTION_SECONDS);

    var self = this;
    _.remove(this.logs, (log) => {
      var logDate = self.DISREGARD_LOG_TIMESTAMP ? log.processed_at : log.time_local;
      return (new Date(logDate) < limit);
    })
  };


  this.topTrafficBreach = -1;
  /**
   * Generates traffic alerts based on whether the threshold has been breached.
   * Note: since logs are processed async, the breach may be registered before all the logs
   * are processed, which might be misleading when reporting the hits. To Rememdy this,
   * while the breach is active, we update the actual max number of logs seen during the breach period
   */
  this.generateAlarmsOrRecovery = () => {
    var trafficAlertActive = this.trafficAlertActive();
    if (trafficAlertActive) {
      this.topTrafficBreach = Math.max(this.topTrafficBreach, this.logs.length);
      if (this.logs.length < this.ALARM_LOG_COUNT_THRESHOLD) {
        // Set the actual breach hits number on the latest traffic alert
        var latestAlert = this.trafficAlerts[this.trafficAlerts.length - 1];
        latestAlert.hits = this.topTrafficBreach;
        this.topTrafficBreach = -1;
        this.recoverFromAlarm();
      }
    } else if (this.logs.length >= this.ALARM_LOG_COUNT_THRESHOLD) {
      this.soundTheAlarm();
    }
  };

  /**
   * Starts the Log Monitor. While active, it will tail the specified log file, and process the results asynchronously.
   * @return {[type]} [description]
   */
  this.start = () => {
    self = this;
    self.startTime = new Date();
    self.asyncProcessLogsLoop();

    this.follower = follow(this.logFilePath);
    this.follower.on('line', function(filename, line) {
      self.handleNewLogLine(line);
    });
  };

  this.asyncProcessLogsLoop = () => {
    self = this;
    setTimeout(() => {
      try {
        self.postLogProcessing();
      } catch (e) {}
      self.asyncProcessLogsLoop();
    }, 250);
  };
};

module.exports = LogMonitor;
