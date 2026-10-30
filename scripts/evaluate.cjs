const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {PNG}=require('pngjs');
const cv=require('../web/vendor/opencv.js');
const engine=require('../web/engine.js');
const manifest=require('../tests/expected.json');
const edgeManifest=require('../tests/edge-expected.json');

cv.then(()=>{
  const results=[];
  for(const f of [...manifest.fixtures,...edgeManifest.fixtures]) {
    const start=performance.now();
    const bytes=fs.readFileSync(path.resolve(__dirname,'../web/samples',f.file));
    const image=PNG.sync.read(bytes);
    const decoded=performance.now();
    const actual=engine.analyze(cv,image);
    const finish=performance.now();
    const error=actual.status==='ok'&&Number.isFinite(f.diameterMm)?Math.abs(actual.diameterMm-f.diameterMm):null;
    results.push({file:f.file,inputType:'synthetic',expectedStatus:f.status,actualStatus:actual.status,expectedDiameterMm:f.diameterMm??null,actualDiameterMm:actual.diameterMm??null,absoluteErrorMm:error,expectedToleranceMm:f.toleranceMm??null,rejectionCode:actual.code??null,passed:actual.status===f.status&&(error===null||error<=f.toleranceMm),decodeMs:+(decoded-start).toFixed(1),processingMs:+(finish-decoded).toFixed(1),totalMs:+(finish-start).toFixed(1),paidApiCostUsd:0});
  }
  const report={
    runAt:new Date().toISOString(),runtime:process.version,engine:'OpenCV4.10.0 / Forma',
    inputType:'synthetic-analytic-fixtures',physicalValidation:'PENDING — no independently measured real objects have been supplied.',
    timingScope:'Node image decode + same pixel measurement engine. Excludes cold OpenCV download/initialization; browser displays end-to-end user-operation latency separately.',
    costAssumptions:'No network inference/recognition/reasoning/speech/retry or intermediary API calls. Paid API variable charges: USD0/image. Device compute/energy not priced. Hosting and bandwidth separate; no free credits assumed.',
    passed:results.filter(x=>x.passed).length,total:results.length,results
  };
  const out=path.resolve(__dirname,'../docs/SYNTHETIC-RESULTS.json');
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.table(results.map(({file,actualStatus,actualDiameterMm,absoluteErrorMm,totalMs,passed})=>({file,actualStatus,actualDiameterMm,absoluteErrorMm,totalMs,passed})));
  console.log(`Saved ${out}`);
  process.exitCode=report.passed===report.total?0:1;
});
