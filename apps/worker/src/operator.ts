import {pool} from '@haven/database';
import {rebuildSearch} from './search-rebuild';
if(process.argv[2]!=='search-rebuild')throw Error('Choose the internal search-rebuild operator command');
try{console.log(JSON.stringify(await rebuildSearch()));}catch(error){console.error(JSON.stringify({status:'failed',code:error instanceof Error&&/^SEARCH_/.test(error.message)?error.message:'SEARCH_REBUILD_UNAVAILABLE'}));process.exitCode=1;}finally{await pool.end();}
