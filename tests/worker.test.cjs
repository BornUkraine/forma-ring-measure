const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../web/measurement-worker.js'),'utf8');

for(const initiallyReady of [true,false]) {
  test(`worker initializes a self-resolving Emscripten module (${initiallyReady?'ready':'deferred'} branch)`,async()=>{
    let thenCalls=0;
    const messages=[];
    const module={then(callback){
      // Break Promise-assimilation regressions instead of starving the test runner.
      if(++thenCalls>2)throw new Error('Self-resolving module was assimilated recursively');
      callback(module);
    }};
    if(initiallyReady)module.Mat=function(){};
    const pixels={width:100,height:100,data:new Uint8ClampedArray(40000)};
    const sandbox={setTimeout,clearTimeout,postMessage:value=>messages.push(value)};
    sandbox.self=sandbox;
    sandbox.importScripts=()=>{
      sandbox.cv=module;
      sandbox.RingMeasureEngine={analyze(cv,image){
        assert.equal(cv,module);
        assert.equal(image,pixels);
        return {status:'retake',code:'test',message:'Expected test result'};
      }};
    };
    vm.runInNewContext(source,sandbox,{timeout:1000,filename:'measurement-worker.js'});
    await new Promise(resolve=>setImmediate(resolve));
    assert.ok(messages.some(message=>message.type==='ready'));
    await sandbox.onmessage({data:{type:'analyze',imageData:pixels,requestId:42}});
    const result=messages.find(message=>message.type==='result');
    assert.ok(result);
    assert.equal(result.requestId,42);
    assert.equal(result.result.code,'test');
    assert.ok(thenCalls<=1);
  });
}
