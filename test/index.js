var LogMon = require("../src/log_mon"),
    clfDate = require('./clf_date'),
    fs = require('fs'),
    testData = require('./test_data');


const LOG_FILE_PATH = './test/access.log';
const clfNow = clfDate();
const TEST_LINES = [
  `127.0.0.1 - james [${clfNow}] "GET /report HTTP/1.0" 200 123`,
  `127.0.0.1 - jill [${clfNow}] "GET /api/user HTTP/1.0" 200 234`,
  `127.0.0.1 - frank [${clfNow}] "POST /api/user HTTP/1.0" 200 34`,
  `127.0.0.1 - mary [${clfNow}] "POST /api/user HTTP/1.0" 503 12`
];

var makeLogMon = (config) => {
  var logMon = new LogMon.LogMonitor(config || {});
  TEST_LINES.forEach((line) => logMon.handleNewLogLine(line));
  return logMon;
};

describe("uris", function() {
  it("should find the section correctly for a two-part uri", function() {
    var uri = '/api/users/';
    var section = LogMon.getSectionFromUri(uri);
    expect(section).toBe('/api');
  });

  it("should find the section correctly for a three-part uri", function() {
    var uri = '/api/users/create';
    var section = LogMon.getSectionFromUri(uri);
    expect(section).toBe('/api');
  });
});

describe("Log Monitor", function() {
  it('should have the correct initial state', () => {
    var logMon = makeLogMon();
    expect(logMon.logs.length).toBe(TEST_LINES.length);
    expect(logMon.trafficAlerts.length).toBe(0);
  });

  describe('alarms', () => {
    it('should trigger when the theshold is breached', () => {
      var logMon = makeLogMon();
      logMon.ALARM_LOG_COUNT_THRESHOLD = logMon.logs.length + 1;
      logMon.handleNewLogLine(TEST_LINES[0]);
      logMon.postLogProcessing();
      expect(logMon.trafficAlerts.length).toBe(1);
      expect(logMon.trafficAlertActive()).toBe(true);
    });

    it('should recover if the next log is under the threshold', () => {
      var logMon = makeLogMon();

      // trigger an alarm
      logMon.ALARM_LOG_COUNT_THRESHOLD = logMon.logs.length + 1;
      logMon.handleNewLogLine(TEST_LINES[0]);
      logMon.postLogProcessing();
      expect(logMon.trafficAlerts.length).toBe(1);
      expect(logMon.trafficAlerts[0].type).toBe(logMon.BREACH_TYPE);

      // get below the threshold again
      logMon.logs.pop();
      logMon.logs.pop();

      logMon.handleNewLogLine(TEST_LINES[0]);
      logMon.postLogProcessing();

      expect(logMon.trafficAlerts.length).toBe(2);
      expect(logMon.trafficAlerts[1].type).toBe(logMon.RECOVERY_TYPE);
    });

  });

  describe('log queue', () => {
    it('should remove cached logs past the retention date time', () => {
      var CACHED_LOG_RETENTION_SECONDS = 10;
      var logMon = makeLogMon({logCacheRetentionTimeSeconds: CACHED_LOG_RETENTION_SECONDS});

      // make all the logs barely older than the retention limit
      logMon.logs.forEach((log) => {
        var createdAt = new Date();
        createdAt.setSeconds(createdAt.getSeconds() - (CACHED_LOG_RETENTION_SECONDS + 1));
        log.time_local = createdAt;
      });

      logMon.handleNewLogLine(TEST_LINES[0]);
      logMon.postLogProcessing();

      expect(logMon.logs.length).toBe(1);
    });

  });
});