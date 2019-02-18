var LogMonitor = require('../src/log_mon'),
    _ = require('lodash'),
    clfDate = require('./clf_date'),
    fs = require('fs');


const LOG_FILE_PATH = './test/access.log';
const clfNow = clfDate();
const TEST_LINES = [
  `127.0.0.1 - james [${clfNow}] "GET /report HTTP/1.0" 200 123`,
  `127.0.0.1 - jill [${clfNow}] "GET /api/user HTTP/1.0" 200 234`,
  `127.0.0.1 - frank [${clfNow}] "POST /api/user HTTP/1.0" 200 34`,
  `127.0.0.1 - mary [${clfNow}] "POST /api/user HTTP/1.0" 503 12`
];

var testNames = ['jon', 'jane', 'bob', 'mary'];
var testSections = ['report/test/api', '/users/create', '/users/delete', 'api/user/create', 'api/user/delete'];
var makeTestLogLines = function(n) {
  return _.times(n, () => {
    return `127.0.0.1 - ${_.sample(testNames)} [${clfDate()}] "GET ${_.sample(testSections)} HTTP/1.0" 200 123\n`;
  })
};


/**
 * Creates a LogMonitor and inputs all the test lines
 */
var makeLogMon = (config) => {
  var logMon = new LogMonitor(config || {logFilePath: LOG_FILE_PATH});

  // fake that it started a 10 minutes ago
  var startTime = new Date();
  startTime.setMinutes(startTime.getMinutes() - 10);
  logMon.startTime = startTime;

  TEST_LINES.forEach((line) => logMon.handleNewLogLine(line));
  logMon.postLogProcessing();
  return logMon;
};

describe('uris', function() {
  var logMon = makeLogMon();
  it('should find the section correctly for a two-part uri', function() {
    var uri = '/api/users/';
    var section = logMon.getSectionFromUri(uri);
    expect(section).toBe('/api');
  });

  it('should find the section correctly for a three-part uri', function() {
    var uri = '/api/users/create';
    var section = logMon.getSectionFromUri(uri);
    expect(section).toBe('/api');
  });
});

describe('Log Monitor', function() {
  it('should have the correct initial state', () => {
    var logMon = makeLogMon();
    expect(logMon.logs.length).toBe(TEST_LINES.length);
    expect(logMon.trafficAlerts.length).toBe(0);
  });

  describe('alarms', () => {
    describe('when the number of required logs is at the threshold', () => {
      var logMon = makeLogMon();
      logMon.logs = [];

      logMon.LOG_COUNT_PER_SECOND_ALARM_THRESHOLD = 2;
      logMon.CACHED_LOG_RETENTION_SECONDS = 10;
      var logsNeededToTriggerAlarm = logMon.CACHED_LOG_RETENTION_SECONDS * logMon.LOG_COUNT_PER_SECOND_ALARM_THRESHOLD;
      // e.g. if we retain logs for 10 seconds, and the alarm threshold is 2 per second, then we need 20 logs to trigger.

      // almost trigger an alarm
      makeTestLogLines(logsNeededToTriggerAlarm).forEach((log) => {
        logMon.handleNewLogLine(log);
      })
      logMon.postLogProcessing();

      it('should not trigger an alarm', () => {
        expect(logMon.trafficAlerts.length).toBe(0);
      })
    });

    describe('when the number of required logs is above the threshold', () => {
      var logMon = makeLogMon();
      logMon.logs = [];

      logMon.LOG_COUNT_PER_SECOND_ALARM_THRESHOLD = 2;
      logMon.CACHED_LOG_RETENTION_SECONDS = 10;
      var logsNeededToTriggerAlarm = logMon.CACHED_LOG_RETENTION_SECONDS * logMon.LOG_COUNT_PER_SECOND_ALARM_THRESHOLD;
      // e.g. if we retain logs for 10 seconds, and the alarm threshold is 2 per second, then we need 20 logs to trigger.

      makeTestLogLines(logsNeededToTriggerAlarm + 1).forEach((log) => {
        logMon.handleNewLogLine(log);
      })
      logMon.postLogProcessing();

      it('should trigger an alarm', () => {
        expect(logMon.trafficAlerts.length).toBe(1);
        expect(logMon.trafficAlerts[0].type).toBe(logMon.BREACH_TYPE);
        expect(logMon.trafficAlertActive()).toBe(true);
      })
    });

    describe('during an alarm when the next log is under the threshold', () => {
      var logMon = makeLogMon();
      logMon.logs = [];

      logMon.LOG_COUNT_PER_SECOND_ALARM_THRESHOLD = 2;
      logMon.CACHED_LOG_RETENTION_SECONDS = 10;
      var logsNeededToTriggerAlarm = logMon.CACHED_LOG_RETENTION_SECONDS * logMon.LOG_COUNT_PER_SECOND_ALARM_THRESHOLD;
      // e.g. if we retain logs for 10 seconds, and the alarm threshold is 2 per second, then we need 20 logs to trigger.

      makeTestLogLines(logsNeededToTriggerAlarm + 1).forEach((log) => {
        logMon.handleNewLogLine(log);
      })
      logMon.postLogProcessing();
      if (logMon.trafficAlerts.length != 1) {
        throw 'A traffic alert should have been created';
      }

      // get below the threshold again
      logMon.logs.pop();
      logMon.logs.pop();

      logMon.handleNewLogLine(makeTestLogLines(1));
      logMon.postLogProcessing();

      it('should recover', () => {
        expect(logMon.trafficAlerts.length).toBe(2);
        expect(logMon.trafficAlerts[1].type).toBe(logMon.RECOVERY_TYPE);
      })
    });
  });

  describe('log queue', () => {
    it('should remove cached logs past the retention date time', () => {
      var CACHED_LOG_RETENTION_SECONDS = 10;
      var logMon = makeLogMon({
        logFilePath: LOG_FILE_PATH,
        logCacheRetentionTimeSeconds: CACHED_LOG_RETENTION_SECONDS
      });

      // make all the logs barely older than the retention limit
      logMon.logs.forEach((log) => {
        var createdAt = new Date();
        createdAt.setSeconds(createdAt.getSeconds() - (CACHED_LOG_RETENTION_SECONDS + 1));
        log.time_local = createdAt;
      });

      const newLogLineUser = 'Frank';
      const newLogLine = `127.0.0.1 - ${newLogLineUser} [${clfNow}] "GET /report HTTP/1.0" 200 123`;
      logMon.handleNewLogLine(newLogLine);
      logMon.postLogProcessing();

      expect(logMon.logs.length).toBe(1);
      expect(logMon.logs[0].remote_user).toBe(newLogLineUser);
    });

  });
});
