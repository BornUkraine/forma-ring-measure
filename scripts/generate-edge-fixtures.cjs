/* Fixed pixel transforms of an analytic scene, not physical validation.
 * Expected outcomes and tolerances are declared before detector evaluation.
 * This generator has no dependency on the measurement engine.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const samples = path.resolve(__dirname, '../web/samples');
const sourceBytes = fs.readFileSync(path.join(samples, 'cutout-17.png'));
const source = PNG.sync.read(sourceBytes);

// This list is the a-priori test plan. None of these outcomes come from a run.
const fixtures = [
  {file:'edge-rotation-90.png',status:'ok',diameterMm:17,toleranceMm:0.4,transform:'Exact 90-degree clockwise rotation, no resampling'},
  {file:'edge-rotation-27.png',status:'ok',diameterMm:17,toleranceMm:0.4,transform:'27-degree clockwise rotation; bilinear resampling on an expanded canvas'},
  {file:'edge-tiny-marker.png',status:'retake',transform:'Whole image downsampled to 30%; marker side is 60 pixels, below the documented 80-pixel minimum'},
  {file:'edge-two-markers.png',status:'retake',transform:'Second exact marker copied into a blank region; multiple scale references are ambiguous'},
  {file:'edge-mild-perspective.png',status:'ok',diameterMm:17,toleranceMm:0.45,transform:'Shared planar homography with mild, near-overhead projective deformation',homography:[1,0.01,30,0.015,1,35,0.000025,0.000015,1]}
];
fs.writeFileSync(path.resolve(__dirname,'../tests/edge-expected.json'),JSON.stringify({
  type:'synthetic-transformed-fixtures',
  notice:'Transformed analytic pixels; not real photographs, independent object measurements, or evidence of physical accuracy.',
  source:'web/samples/cutout-17.png',
  sourceSha256:crypto.createHash('sha256').update(sourceBytes).digest('hex'),
  expectedOutcomesRecordedBeforeEvaluation:true,
  fixtures
},null,2)+'\n');

function pixel(image,x,y,c) {
  if(x<0||y<0||x>=image.width||y>=image.height)return [245,243,239,255][c];
  return image.data[(y*image.width+x)*4+c];
}
function resample(width,height,inverse) {
  const out = new PNG({width,height});
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const p=inverse(x,y),ix=Math.floor(p.x),iy=Math.floor(p.y),fx=p.x-ix,fy=p.y-iy;
    const dst=(y*width+x)*4;
    for(let c=0;c<3;c++)out.data[dst+c]=Math.round(
      pixel(source,ix,iy,c)*(1-fx)*(1-fy)+pixel(source,ix+1,iy,c)*fx*(1-fy)
      +pixel(source,ix,iy+1,c)*(1-fx)*fy+pixel(source,ix+1,iy+1,c)*fx*fy);
    out.data[dst+3]=255;
  }
  return out;
}
function inverse3(m) {
  const [a,b,c,d,e,f,g,h,i]=m;
  const cof=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
  const determinant=a*cof[0]+b*cof[3]+c*cof[6];
  return cof.map(v=>v/determinant);
}
function write(name,png) { fs.writeFileSync(path.join(samples,name),PNG.sync.write(png)); }

const rotated = new PNG({width:source.height,height:source.width});
for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++) {
  const src=(y*source.width+x)*4,dst=(x*rotated.width+(source.height-1-y))*4;
  source.data.copy(rotated.data,dst,src,src+4);
}
write(fixtures[0].file,rotated);

const angle=27*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
const width=Math.ceil(source.width*cos+source.height*sin)+20;
const height=Math.ceil(source.width*sin+source.height*cos)+20;
write(fixtures[1].file,resample(width,height,(x,y)=>{
  const dx=x-(width-1)/2,dy=y-(height-1)/2;
  return {x:cos*dx+sin*dy+(source.width-1)/2,y:-sin*dx+cos*dy+(source.height-1)/2};
}));

write(fixtures[2].file,resample(300,210,(x,y)=>({x:(x+0.5)/0.3-0.5,y:(y+0.5)/0.3-0.5})));

const two = new PNG({width:source.width,height:source.height});
source.data.copy(two.data);
for(let y=0;y<200;y++)for(let x=0;x<200;x++) {
  const src=((y+240)*source.width+(x+110))*4,dst=((y+30)*two.width+(x+760))*4;
  source.data.copy(two.data,dst,src,src+4);
}
write(fixtures[3].file,two);

const inv=inverse3(fixtures[4].homography);
write(fixtures[4].file,resample(1100,800,(x,y)=>{
  const z=inv[6]*x+inv[7]*y+inv[8];
  return {x:(inv[0]*x+inv[1]*y+inv[2])/z,y:(inv[3]*x+inv[4]*y+inv[5])/z};
}));
console.log(`Generated ${fixtures.length} bounded synthetic edge cases and their separate a-priori expectations.`);
