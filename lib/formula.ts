export type FormulaMeasurement={token:string;unit:string;value:number};

export function formulaTokens(formula:string){return Array.from(formula.matchAll(/\{\{([A-Z0-9_]+)\}\}/g),match=>match[1])}

export function normalizeFormulaTokens(formula:string,fields:{name:string;token:string}[]){
  const protectedTokens:string[]=[];
  let normalized=formula.replace(/\{\{[A-Z0-9_]+\}\}/g,token=>{protectedTokens.push(token);return `@@TOKEN_${protectedTokens.length-1}@@`});
  const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  for(const field of [...fields].sort((a,b)=>b.name.length-a.name.length)){
    normalized=normalized.replace(new RegExp(`\\b${escape(field.name)}\\b`,"gi"),`{{${field.token}}}`);
  }
  return normalized.replace(/@@TOKEN_(\d+)@@/g,(_,index)=>protectedTokens[Number(index)]);
}

export function calculateFormula(formula:string,measurements:FormulaMeasurement[],rounding="ceil"){
  const byToken=new Map(measurements.map(item=>[item.token,item]));
  let expression=formula.replace(/\{\{([A-Z0-9_]+)\}\}/g,(_,token:string)=>{
    const field=byToken.get(token);if(!field)throw new Error(`Missing measurement: ${token}`);
    return String(field.unit.toUpperCase()==="PCT"?Number(field.value)/100:Number(field.value));
  });
  if(!expression.trim())return 1;
  if(!/^[0-9+\-*/().\s]+$/.test(expression))throw new Error("Formula contains unsupported characters");
  let index=0;
  const skip=()=>{while(/\s/.test(expression[index]||""))index++};
  const number=()=>{skip();const start=index;while(/[0-9.]/.test(expression[index]||""))index++;if(start===index)throw new Error("Expected a number");const value=Number(expression.slice(start,index));if(!Number.isFinite(value))throw new Error("Invalid number");return value};
  const factor=():number=>{skip();if(expression[index]==="("){index++;const value=sum();skip();if(expression[index]!==")")throw new Error("Missing closing parenthesis");index++;return value}if(expression[index]==="-"){index++;return-factor()}return number()};
  const product=()=>{let value=factor();while(true){skip();const operator=expression[index];if(operator!=="*"&&operator!=="/")break;index++;const right=factor();value=operator==="*"?value*right:value/right}return value};
  const sum=()=>{let value=product();while(true){skip();const operator=expression[index];if(operator!=="+"&&operator!=="-")break;index++;const right=product();value=operator==="+"?value+right:value-right}return value};
  const raw=sum();skip();if(index<expression.length)throw new Error("Formula could not be calculated");if(!Number.isFinite(raw))throw new Error("Formula returned an invalid number");
  const safe=Math.max(0,raw);if(rounding==="ceil")return Math.ceil(safe);if(rounding==="floor")return Math.floor(safe);if(rounding==="round")return Math.round(safe);return Number(safe.toFixed(3));
}
