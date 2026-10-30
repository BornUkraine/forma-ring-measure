// Fetch the exact publisher files; no editing or synthetic marker insertion.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifestPath=resolve(root,'tests/real-photo-manifest.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const base=resolve(dirname(manifestPath),manifest.baseDir);
await mkdir(base,{recursive:true});
let previous=[];
try { previous=JSON.parse(await readFile(resolve(root,'tests/real-photo-downloads.json'),'utf8')).downloads; } catch {}
const downloaded=[];
for(const image of manifest.images){
  if(image.file!==basename(image.file))throw new Error('Input filename must be a plain basename');
  const target=resolve(base,image.file);
  if(!target.startsWith(base+sep))throw new Error('Unexpected download destination');
  const receipt=previous.find(entry=>entry.file===image.file&&entry.imageUrl===image.imageUrl);
  if(receipt){
    try {
      const cached=await readFile(target);
      if(createHash('sha256').update(cached).digest('hex')===receipt.sha256){
        downloaded.push(receipt);console.log(`${image.file}: verified cached original`);continue;
      }
    } catch {}
  }
  const response=await fetch(image.imageUrl,{headers:{'User-Agent':'FormaRingMeasurement/0.1 (public-image validation; local research)'}});
  if(!response.ok)throw new Error(`${image.file}: HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>20*1024*1024)throw new Error('Original exceeds application limit');
  if(bytes[0]!==0xff||bytes[1]!==0xd8)throw new Error('Expected original JPEG bytes');
  await writeFile(target,bytes);
  downloaded.push({file:image.file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sourceUrl:image.sourceUrl,imageUrl:image.imageUrl,downloadedAt:new Date().toISOString(),localModification:'None; exact downloaded bytes retained. Publisher versions may have their own documented edits.'});
  console.log(`${image.file}: ${bytes.length} bytes`);
}
await writeFile(resolve(root,'tests/real-photo-downloads.json'),JSON.stringify({downloads:downloaded},null,2)+'\n');
