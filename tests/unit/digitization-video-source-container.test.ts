import {expect,it} from 'vitest';
import {smallVideoContainerMime} from '../../apps/api/src/inventory/digitization/video-source-container';
import fixtures from '../../services/property-processing/tests/fixtures/media-synthetic.json';
it('self-authored MP4/MOV/WebM declarations match actual codec fixtures without approving decoding',()=>{for(const [name,mime] of [['rotated.mp4','video/mp4'],['hevc.mov','video/quicktime'],['vp8.webm','video/webm'],['vp9.webm','video/webm']] as const)expect(smallVideoContainerMime(Buffer.from(fixtures.files[name].base64,'base64'))).toBe(mime);});
it('fake MIME, corrupt brand length and unsupported declarations are denied',()=>{for(const body of [Buffer.alloc(8),Buffer.alloc(32),Buffer.from(fixtures.files['quadrants.png'].base64,'base64')])expect(()=>smallVideoContainerMime(body)).toThrow();const invalid=Buffer.from(fixtures.files['source.mp4'].base64,'base64');invalid.writeUInt32BE(8192,0);expect(()=>smallVideoContainerMime(invalid)).toThrow();});
