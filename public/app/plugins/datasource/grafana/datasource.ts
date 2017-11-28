///<reference path="../../../headers/common.d.ts" />

import _ from 'lodash';

class GrafanaDatasource {

  baseURL = "https://api.lightstep.com";
  authKey = "";
  organizationName = "LightStep";
  projectName = "lightstep-meta";

  /** @ngInject */
  constructor(private backendSrv, private $q) {}

  traceQuery(oldestMs, youngestMs, savedSearchID) {
    let resolutionMs = Math.max(60000, (youngestMs - oldestMs) / 1440);
    return this.backendSrv.datasourceRequest({
      method: "GET",
      url: this.baseURL + "/public/v0.1/" + this.organizationName + "/projects/" +
      this.projectName + "/searches/" + savedSearchID + "/timeseries",
      params: {
        "oldest-time": this.formatDate(oldestMs),
        "youngest-time": this.formatDate(youngestMs),
        "resolution-ms": Math.floor(resolutionMs),
        "include-exemplars": "1",
      },
      headers: {
        "Authorization": "bearer " + this.authKey,
      },
    });
  }

  loadTraces(options) {
    var mode = "timeseries";
    var searchIDs = [];
    for (let i = 0; i < options.targets.length; i++) {
      let target = options.targets[i];
      if (target.latencyTraceSearchID) {
        searchIDs = [target.latencyTraceSearchID];
        mode = "latency";
        break;
      } else if (target.traceSearchID && target.traceSearchID !== "Saved Search ID") {
        searchIDs.push(target.traceSearchID);
      }
    }
    var tracePromises = [];
    for (let i = 0; i < searchIDs.length; i++) {
      let p = this.traceQuery(options.range.from.valueOf(), options.range.to.valueOf(), searchIDs[i]);
      tracePromises.push(p);
    }
    let results = Promise.all(tracePromises).then(traces => {
      var res = {};
      for (let i = 0; i < traces.length; i++) {
        if (traces[i].data.data.attributes.exemplars !== undefined) {
          res[searchIDs[i]] = _.sortBy(traces[i].data.data.attributes.exemplars, ex => { return ex.youngest_micros; });
        }
      }
      return res;
    }).catch(err => {
      console.log("error querying lightstep", err);
      return {};
    });
    return {"results": results, "mode": mode};
  }

  zeroPad(n) {
    if (n >= 10) {
      return n;
    }
    return "0" + n;
  }

  formatDate(ms) {
    let offset = new Date().getTimezoneOffset() * 60 * 1000;
    let d = new Date(ms + offset);
    return d.getFullYear() + "-" + this.zeroPad(d.getMonth()+1) + "-" + this.zeroPad(d.getDate()) + "T" +
        this.zeroPad(d.getHours()) + ":" + this.zeroPad(d.getMinutes()) + ":" + this.zeroPad(d.getSeconds()) + "Z";
  }

  injectTraces(options, data) {
    let traces = this.loadTraces(options);
    let mode = traces.mode;

    return Promise.all([data, traces.results]).then(res => {
      let tss = res[0];
      let tr = res[1];

      var newData = [];
      var count = 0;
      var seen = {};
      if (mode === "latency") {
        _.forEach(tr, t => {
          var newDP = [];
          var newTR = [];
          for (let i = 0; i < t.length; i++) {
            let ex = t[i];
            newDP.push([ex.duration_micros / 1000, ex.youngest_micros / 1000]);
            newTR.push(ex.span_guid);
            if (seen[ex.span_guid] === undefined) {
              count++;
              seen[ex.span_guid] = true;
            }
          }
          newData.push({
            target: "traces",
            datapoints: newDP,
            traceIds: newTR,
            yaxis: 2,
          });
        });
      } else if (mode === "timeseries") {
        _.forEach(tss['data'], ts => {
          if (ts.traceSearchID !== undefined && tr[ts.traceSearchID] !== undefined) {
            var newDP = [];
            var newTR = [];
            let traces = tr[ts.traceSearchID];
            delete ts['traceSearchID'];
            var k = 0;
            for (let i = 0; i < ts.datapoints.length;) {
              if (k >= traces.length) {
                break;
              }
              let ex = traces[k];
              let dp = ts.datapoints[i];
              if (i === ts.datapoints.length - 1) {
                newTR.push(ex.span_guid);
                newDP.push(dp);
                break;
              }
              let ndp = ts.datapoints[i+1];
              let ms = ex.youngest_micros / 1000;
              if (ms >= ndp[1]) {
                i++;
                continue;
              }
              k++;
              let nv = (((ms - dp[1]) / (ndp[1] - dp[1])) * (ndp[0] - dp[0])) + dp[0];
              newTR.push(ex.span_guid);
              newDP.push([nv, ms]);
            }
            if (newDP.length > 0) {
              newData.push({
                target: ts.target + " traces",
                datapoints: newDP,
                traceIds: newTR,
              });
            }
          }
        });
      }
      return {
        data: tss['data'].concat(newData),
      };
    });
  }

  query(options) {
    var timeseriesQs = [];
    for (let i = 0; i < options.targets.length; i++) {
      let target = options.targets[i];
      timeseriesQs.push(this.backendSrv
          .get('/api/tsdb/testdata/random-walk', {
            name: String.fromCharCode(65 + i),
            from: options.range.from.valueOf(),
            to: options.range.to.valueOf(),
            intervalMs: options.intervalMs,
            maxDataPoints: options.maxDataPoints,
          }).then(res => {
            var data = [];
            if (res.results !== undefined) {
              _.forEach(res.results, queryRes => {
                for (let series of queryRes.series) {
                  data.push({
                    target: series.name,
                    datapoints: series.points,
                    traceSearchID: target.traceSearchID,
                  });
                }
              });
            }
            return data;
          }));
    }
    let timeseries = Promise.all(timeseriesQs)
        .then(ress => {
          return {data: _.flatten(ress)};
        });

    return this.injectTraces(options, timeseries);
  }

  metricFindQuery(options) {
    return this.$q.when({data: []});
  }

  annotationQuery(options) {
    return this.backendSrv.get('/api/annotations', {
      from: options.range.from.valueOf(),
      to: options.range.to.valueOf(),
      limit: options.limit,
      type: options.type,
    });
  }

}

export {GrafanaDatasource};
