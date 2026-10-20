// One bounded, read-only replay session. Secrets arrive on stdin, never argv/env.
#include "NetSdkModule.h"
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <cstdio>
#include <string>
#include <iostream>
#include <algorithm>
#include <atomic>
#include <mutex>
#include <chrono>
#include <thread>
#include <arpa/inet.h>
static int output=-1;
static std::mutex lock;
static std::atomic<bool> done{false};
static unsigned long bytes=0,frames=0;
static int frame(NET_HANDLE, const NET_SDK_PACKET_INFO_EX* p, NET_USER) {
  if(!p || done || p->nPacketType<1 || p->nPacketType>5) return 1;
  if(!p->pAVContent || p->dwContentSize==0 || p->dwContentSize>2*1024*1024){done=true;return 0;}
  std::lock_guard<std::mutex> guard(lock);
  if(bytes+p->dwContentSize>64*1024*1024 || ++frames>7200){done=true;return 0;}
  unsigned int header[12]={0x54535231,p->dwContentSize,p->dwFrameRate,static_cast<unsigned>(p->nPacketType),static_cast<unsigned>(p->nYear),static_cast<unsigned>(p->nMonth),static_cast<unsigned>(p->nDay),static_cast<unsigned>(p->nHour),static_cast<unsigned>(p->nMinute),static_cast<unsigned>(p->nSecond),p->dwTimeStamp,p->dwTimeStampHigh};
  for(auto& n:header)n=htonl(n);
  auto emit=[](const void* data,size_t size){const char* at=static_cast<const char*>(data);while(size){const auto n=write(output,at,size);if(n<=0)return false;at+=n;size-=n;}return true;};
  if(!emit(header,sizeof(header))||!emit(p->pAVContent,p->dwContentSize)){done=true;return 0;}
  bytes+=p->dwContentSize;return 1;
}
static void progress(NET_HANDLE,long total,long current,NET_USER){if(current<0 || total>0 && current>=total)done=true;}
int main() {
  alarm(85);signal(SIGPIPE,SIG_IGN);
  std::string host, port, user, password,mode,channel,start,end;
  if (!std::getline(std::cin,host)||!std::getline(std::cin,port)||!std::getline(std::cin,user)||!std::getline(std::cin,password)||!std::getline(std::cin,mode)) return 2;
  in_addr ip{};if(inet_pton(AF_INET,host.c_str(),&ip)!=1 || host.size()>15 || user.size()>128 || password.size()>256 || !std::all_of(port.begin(),port.end(),[](char c){return c>='0'&&c<='9';}) || port.empty() || port.size()>5 || std::stoi(port)<1 || std::stoi(port)>65535)return 2;
  if(mode!="channels"&&mode!="replay")return 2;
  NET_SDK_FINDINFO find={};
  if(mode=="replay"){
    if(!std::getline(std::cin,channel)||!std::getline(std::cin,start)||!std::getline(std::cin,end))return 2;
    if(channel.empty()||channel.size()>3||!std::all_of(channel.begin(),channel.end(),[](char c){return c>='0'&&c<='9';}))return 2;
    find.nChannelN0=std::stoi(channel);if(find.nChannelN0>127)return 2;
    auto parse=[](const std::string& s,NET_SDK_TIME& t){return s.size()==19&&sscanf(s.c_str(),"%d-%d-%d %d:%d:%d",&t.dwYear,&t.dwMonth,&t.dwDay,&t.dwHour,&t.dwMinute,&t.dwSecond)==6;};
    if(!parse(start,find.startTime)||!parse(end,find.endTime))return 2;
  }
  output=dup(STDOUT_FILENO);const int silent=open("/dev/null",O_WRONLY);
  dup2(silent,STDOUT_FILENO);dup2(silent,STDERR_FILENO);close(silent);
  NET_SDK_Init(nullptr,0);
  NET_SDK_SetConnectTime(4000,1);
  NET_SDK_DEVICEINFO info={};int error=0;
  const auto session=NET_SDK_Login(host.data(),static_cast<unsigned short>(std::stoi(port)),user.data(),password.data(),&info,0,&error,4000,1);
  password.assign(password.size(),'\0');
  if(session<=0){dprintf(output,"{\"error\":\"NVR_NATIVE_AUTH_FAILED\",\"vendorCode\":%d}\n",error);NET_SDK_Cleanup();return 3;}
  if(mode=="channels"){
    NET_SDK_NetDecorderConfigAll config={};unsigned long returned=0;
    const auto read=NET_SDK_GetDevConfig(session,NET_SDK_NETDECORDER,-1,reinterpret_cast<char*>(&config),sizeof(config),&returned,4000);
    dprintf(output,"{\"authenticated\":true,\"configuredChannels\":%d,\"readCode\":%ld,\"vendorCode\":%ld,\"mapped\":%s,\"channels\":[",info.byChanNum+info.iDigChannel,read,NET_SDK_GetLastError(),read>=0?"true":"false");
    bool first=true;
    if(read>=0)for(int i=0;i<std::min(32,info.iDigChannel);i++){
      const auto& c=config.DigitChnConf[i];if(!c.Enable||c.ConfNum<1||c.ConnType!=0||c.SingleConnId<1||c.SingleConnId>SDK_NET_MAX_MULTINET_NUM)continue;
      const auto& d=c.vNetDecorderConf[c.SingleConnId-1];const std::string address(d.Address,strnlen(d.Address,sizeof(d.Address)));in_addr remote{};
      if(inet_pton(AF_INET,address.c_str(),&remote)!=1)continue;
      dprintf(output,"%s{\"index\":%d,\"address\":\"%s\"}",first?"":",",i+info.byChanNum,address.c_str());first=false;
    }dprintf(output,"]}\n");
  }else{
    if(find.nChannelN0>=info.byChanNum+info.iDigChannel)return 2;
    // This vendor build requires a nonzero callback cookie even when unused.
    const auto replay=NET_SDK_PlayBackByTime_Ex(session,&find,frame,1,progress,1);
    if(replay<=0){dprintf(output,"{\"error\":\"CAMERA_REPLAY_FAILED\",\"vendorCode\":%ld}\n",NET_SDK_GetLastError());NET_SDK_Logout(session);NET_SDK_Cleanup();return 4;}
    for(int i=0;i<750&&!done;i++)std::this_thread::sleep_for(std::chrono::milliseconds(100));
    NET_SDK_StopPlayBack(replay);
  }
  if(session>0)NET_SDK_Logout(session);
  NET_SDK_Cleanup();close(output);return session>0?0:3;
}
