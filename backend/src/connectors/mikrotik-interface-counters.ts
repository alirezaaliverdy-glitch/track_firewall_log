export function parseMikroTikInterfaceCounters(output:string) {
  return output.split(/(?=\bname=)/).flatMap(section=>{
    const name=section.match(/^name=(?:"([^"]+)"|(\S+))/)?.slice(1).find(Boolean);
    const counter=(key:string)=>{
      const value=section.match(new RegExp(`(?:^|\\s)${key}=([\\d ]+)(?=\\s+[a-z][a-z-]*=|\\r?\\n|$)`))?.[1];
      return value===undefined?NaN:Number(value.replace(/ /g,""));
    };
    const rxBytes=counter("rx-byte"),txBytes=counter("tx-byte");
    return name&&Number.isSafeInteger(rxBytes)&&Number.isSafeInteger(txBytes)&&rxBytes>=0&&txBytes>=0?[{name,rxBytes,txBytes}]:[];
  });
}
