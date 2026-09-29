import { useEffect, useRef } from "react";
import Highcharts from "highcharts";
import "highcharts/modules/accessibility";
import { chartReadings, type Reading } from "@/features/assets/components/assetChartData";

export function FleetMiniChart({title,series,unit,binary=false,motion,locale}:{title:string;series:Array<{name:string;color:string;points:Reading[]}>;unit:string;binary?:boolean;motion:boolean;locale:string}) {
  const element=useRef<HTMLDivElement>(null), chart=useRef<Highcharts.Chart|null>(null);
  useEffect(()=>{
    if(!element.current)return;
    chart.current=Highcharts.chart(element.current,{});
    const resize=new ResizeObserver(()=>chart.current?.reflow());resize.observe(element.current);
    return()=>{resize.disconnect();chart.current?.destroy();chart.current=null;};
  },[]);
  useEffect(()=>{
    const animated=motion&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chart.current?.update({
      chart:{type:binary?"line":"area",height:105,backgroundColor:"transparent",spacing:[4,2,2,2],animation:animated?{duration:650}:false,style:{fontFamily:"inherit"}},
      title:{text:undefined},credits:{enabled:true,style:{color:"#66778b",fontSize:"8px"}},legend:{enabled:false},accessibility:{description:title},
      xAxis:{type:"datetime",lineWidth:0,tickLength:0,labels:{enabled:false}},
      yAxis:{title:{text:undefined},min:0,max:binary?1:unit==="%"?100:undefined,tickPositions:binary?[0,.5,1]:undefined,gridLineColor:"rgba(148,163,184,.09)",labels:{enabled:!binary,style:{color:"#8192a7",fontSize:"9px"}}},
      tooltip:{shared:true,backgroundColor:"#172333",borderColor:"#38495d",style:{color:"#e2e8f0"},xDateFormat:"%H:%M:%S",valueDecimals:unit==="Mbps"?3:1,valueSuffix:` ${unit}`, ...(binary?{pointFormatter:function(){return this.y===1?(locale.startsWith("fa")?"برقرار":"Online"):this.y===0?(locale.startsWith("fa")?"قطع":"Offline"):(locale.startsWith("fa")?"نامشخص":"Unknown");}}:{})},
      plotOptions:{series:{animation:animated?{duration:650}:false,connectNulls:false,lineWidth:2,marker:{enabled:false},states:{inactive:{opacity:.7}}},area:{fillOpacity:.09}},
      series:series.map((s,index)=>({id:`fleet-${index}`,type:binary?"line":"area",name:s.name,color:s.color,step:binary?"left":undefined,marker:{enabled:s.points.length<2,radius:3},data:chartReadings(s.points,binary)}))
    },true,true,animated?{duration:650}:false);
  },[title,series,unit,binary,motion,locale]);
  return <div ref={element} dir="ltr" className="fleet-mini-plot" aria-label={title}/>;
}
