import {pool} from '../packages/database/src/index';
import {rebuildSearch} from '../apps/worker/src/search-rebuild';
try{console.log(JSON.stringify(await rebuildSearch()));}
catch(error){console.error(JSON.stringify({status:'failed',code:error instanceof Error&&/^SEARCH_/.test(error.message)?error.message:'SEARCH_REBUILD_UNAVAILABLE'}));process.exitCode=1;}
finally{await pool.end();}
