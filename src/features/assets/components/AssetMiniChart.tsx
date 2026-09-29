import { useEffect, useRef, useState } from "react";
import Highcharts from "highcharts";
import "highcharts/modules/accessibility";
import { chartReadings, type Reading } from "@/features/assets/components/assetChartData";

export function AssetMiniChart({title,series,unit,binary=false,motion,locale,height=160}:{title:string;series:Array<{name:string;color:string;points:Reading[]}>;unit:string;binary?:boolean;motion:boolean;locale:string;height?:number}) {
  const element=useRef<HTMLDivElement>(null), chart=useRef<Highcharts.Chart|null>(null);
  const [reduced,setReduced]=useState(()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    const change=()=>setReduced(media.matches);
    media.addEventListener("change",change);
    return()=>media.removeEventListener("change",change);
  },[]);
  useEffect(()=>{
    if(!element.current)return;
    chart.current=Highcharts.chart(element.current,{});
    const resize=new ResizeObserver(()=>chart.current?.reflow());resize.observe(element.current);
    return()=>{resize.disconnect();chart.current?.destroy();chart.current=null;};
  },[]);
  useEffect(()=>{
    const animated=motion&&!reduced;
    chart.current?.update({
      chart:{type:binary?"line":"area",height,backgroundColor:"transparent",spacing:[7,4,4,4],animation:animated?{duration:650}:false,style:{fontFamily:"inherit"}},
      title:{text:undefined},time:{timezone:"Asia/Tehran"},credits:{enabled:true,style:{color:"#66778b",fontSize:"8px"}},legend:{enabled:series.length>1,align:"center",itemStyle:{color:"#a7b8cb",fontSize:"10px",fontWeight:"normal"},symbolWidth:14,padding:3,margin:5},accessibility:{description:title},
      xAxis:{type:"datetime",lineWidth:0,tickLength:0,labels:{enabled:true,format:"{value:%H:%M}",style:{color:"#8595ab",fontSize:"10px"}}},
      yAxis:{title:{text:undefined},min:0,max:binary?1:unit==="%"?100:undefined,tickPositions:binary?[0,.5,1]:undefined,gridLineColor:"rgba(148,163,184,.09)",labels:{enabled:!binary,style:{color:"#8192a7",fontSize:"9px"}}},
      tooltip:{shared:true,backgroundColor:"#172333",borderColor:"#38495d",style:{color:"#e2e8f0"},xDateFormat:"%H:%M:%S",valueDecimals:unit==="Mbps"?3:1,valueSuffix:` ${unit}`, ...(binary?{pointFormatter:function(){return this.y===1?(locale.startsWith("fa")?"برقرار":"Online"):this.y===0?(locale.startsWith("fa")?"قطع":"Offline"):(locale.startsWith("fa")?"نامشخص":"Unknown");}}:{})},
      plotOptions:{series:{animation:animated?{duration:900}:false,connectNulls:false,lineWidth:2,marker:{enabled:false},states:{inactive:{opacity:.7}}},area:{fillOpacity:.1}},
      series:series.map((s,index)=>({id:`asset-${index}`,type:binary?"line":"area",name:s.name,color:s.color,step:binary?"left":undefined,marker:{enabled:s.points.length<2,radius:3,states:{hover:{enabled:true,radius:4}}},data:chartReadings(s.points,binary).map(([x,y],i,points)=>({x,y,...(y!==null&&i===points.length-1?{marker:{enabled:true,radius:3,fillColor:s.color,lineColor:"#d6e0ef",lineWidth:1}}:{})}))}))
    },true,true,animated?{duration:650}:false);
  },[title,series,unit,binary,motion,locale,height,reduced]);
  return <div ref={element} dir="ltr" className="asset-mini-plot" data-animated={motion&&!reduced} aria-label={title}/>;
}
