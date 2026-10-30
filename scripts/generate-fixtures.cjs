/* Analytic synthetic scenes, not photographs or independently measured objects.
 * Expected outcomes are specified here before running the detector.
 * The detector never imports this file or the separate ground-truth manifest. */
const { PNG } = require('pngjs');
const fs = require('node:fs');
const path = require('node:path');
const OUT = path.resolve(__dirname, '../web/samples');
const TEST = path.resolve(__dirname, '../tests');
fs.mkdirSync(OUT, {recursive:true});
const PAYLOAD = [[1,0,0,0],[1,1,0,1],[0,1,0,0],[1,0,1,1]];
const markerBit = (col,row) => col===0||row===0||col===5||row===5 ? 1 : PAYLOAD[row-1][col-1];
function scene(name,options={}) {
  const width=1000,height=700,ppm=options.ppm||10;
  const png=new PNG({width,height});
  const diameter=options.diameter||17;
  const rings=options.rings||[{cx:620,cy:340,d:diameter}];
  let seed=1741;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=(y*width+x)*4;
    const noise=(rand()-.5)*(options.noise||3);
    let base=243 + 5*x/width - 5*y/height + noise;
    let rgb=[base,base-2,base-6];
    // Matte contrasting ring with a softly shaded metal band and antialiased edges.
    for(const ring of rings) {
      const ry=(y-ring.cy)/(options.ellipse||1);
      const distance=Math.hypot(x-ring.cx,ry);
      const inner=ring.d*ppm/2,outer=inner+22;
      const cov=Math.max(0,Math.min(1,distance-inner+.5,outer-distance+.5));
      if(cov>0) {
        const shine=18*Math.cos(Math.atan2(ry,x-ring.cx)-.6);
        const metal=[58+shine,62+shine,59+shine];
        rgb=rgb.map((c,k)=>c*(1-cov)+metal[k]*cov);
      }
    }
    if(!options.noMarker) {
      const markerSize=20*ppm;
      const mx=x-110,my=y-240;
      // A deliberately compressed marker is an unsupported perspective scene.
      const localX=mx/(options.markerSquash||1);
      if(localX>=0&&localX<markerSize&&my>=0&&my<markerSize) {
        const col=Math.min(5,Math.floor(localX/markerSize*6));
        const row=Math.min(5,Math.floor(my/markerSize*6));
        const bit=options.plainSquare?1:markerBit(col,row);
        rgb=bit?[24+noise,25+noise,23+noise]:[249+noise,249+noise,247+noise];
      }
    }
    for(let k=0;k<3;k++)png.data[i+k]=Math.round(Math.max(0,Math.min(255,rgb[k])));
    png.data[i+3]=255;
  }
  if(options.blur) {
    // Separable box blur; actual pixels are degraded, not a filename-based condition.
    const r=options.blur,temp=Buffer.alloc(png.data.length);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++) {
      let sum=0;for(let o=-r;o<=r;o++)sum+=png.data[(y*width+Math.max(0,Math.min(width-1,x+o)))*4+c];
      temp[(y*width+x)*4+c]=sum/(2*r+1);temp[(y*width+x)*4+3]=255;
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++) {
      let sum=0;for(let o=-r;o<=r;o++)sum+=temp[(Math.max(0,Math.min(height-1,y+o))*width+x)*4+c];
      png.data[(y*width+x)*4+c]=sum/(2*r+1);
    }
  }
  fs.writeFileSync(path.join(OUT,name),PNG.sync.write(png));
}
const fixtures=[
 {file:'cutout-17.png',options:{diameter:17},expected:{status:'ok',diameterMm:17,toleranceMm:.35}},
 {file:'cutout-20.png',options:{diameter:20},expected:{status:'ok',diameterMm:20,toleranceMm:.35}},
 {file:'cutout-18-noisy.png',options:{diameter:18,noise:14},expected:{status:'ok',diameterMm:18,toleranceMm:.4}},
 {file:'missing-marker.png',options:{noMarker:true},expected:{status:'retake'}},
 {file:'wrong-square.png',options:{plainSquare:true},expected:{status:'retake'}},
 {file:'blurred.png',options:{blur:12},expected:{status:'retake'}},
 {file:'tilted.png',options:{ellipse:.65,markerSquash:.65},expected:{status:'retake'}},
 {file:'two-rings.png',options:{rings:[{cx:550,cy:250,d:17},{cx:800,cy:490,d:18}]},expected:{status:'retake'}},
 {file:'clipped-ring.png',options:{rings:[{cx:985,cy:350,d:17}]},expected:{status:'retake'}}
];
for(const f of fixtures)scene(f.file,f.options);
const manifest={
  type:'synthetic-analytic-fixtures',
  notice:'Generated circles and encoded markers. These are NOT physical object photographs or independent caliper measurements. Physical validation is pending.',
  expectedOutcomesRecordedBeforeEvaluation:true,
  geometry:{imageWidth:1000,imageHeight:700,markerSideMm:20,pixelsPerMm:10},
  fixtures:fixtures.map(({file,options,expected})=>({file,...expected,conditions:options}))
};
fs.writeFileSync(path.join(TEST,'expected.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Generated ${fixtures.length} labelled synthetic fixtures and separate expected outcomes.`);
