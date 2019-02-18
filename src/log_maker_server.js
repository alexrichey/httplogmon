const express = require('express'),
      clfDate = require('../test/clf_date'),
      fs = require('fs'),
      _ = require('lodash');

var testNames = ['jon', 'jane', 'bob', 'mary'];
var testSections = ['report/test/api', '/users/create', '/users/delete', 'api/user/create', 'api/user/delete'];

var makeTestLogLine = function() {
  return `127.0.0.1 - ${_.sample(testNames)} [${clfDate()}] "GET ${_.sample(testSections)} HTTP/1.0" 200 123\n`;
};

module.exports = function(logFilePath, port) {
  const app = express();
  app.get('/', (req, res) => res.send('Hello World!'));

  app.post('/', (req, res) => {
    var logsToCreateCount = parseInt(req.query.count);
    for (var i = 0; i < logsToCreateCount; i++) {
      var testLine = makeTestLogLine();
      fs.appendFileSync(logFilePath, testLine);
    }
    res.send('Created!');
  });

  app.listen(port, () => console.log(`Example app listening on port ${port}!`));
};
