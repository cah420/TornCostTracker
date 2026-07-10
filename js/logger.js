/**
 * logger.js
 */
function ts(){
 return new Date().toLocaleTimeString();
}
export const Logger={
 info(...a){console.log(`[${ts()}] INFO`,...a);},
 warn(...a){console.warn(`[${ts()}] WARN`,...a);},
 error(...a){console.error(`[${ts()}] ERROR`,...a);}
};
