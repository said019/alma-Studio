const storageKey = 'hive:campaign-intent';
let memory: {key:string;fingerprint:string}|null = null;
export function campaignKey(payload: unknown) {
  const fingerprint=JSON.stringify(payload);
  try{memory=JSON.parse(sessionStorage.getItem(storageKey)||'null')??memory;}catch{/* storage optional */}
  if(memory?.fingerprint===fingerprint)return memory.key;
  memory={key:crypto.randomUUID(),fingerprint};
  try{sessionStorage.setItem(storageKey,JSON.stringify(memory));}catch{/* retry remains in memory */}
  return memory.key;
}
export function completeCampaign(){memory=null;try{sessionStorage.removeItem(storageKey);}catch{/* optional */}}
