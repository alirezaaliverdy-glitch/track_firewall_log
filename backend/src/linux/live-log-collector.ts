// Fixed read-only collector. No shell evaluation, user commands, environment or full config export.
// One SSH channel multiplexes sources, avoiding sshd MaxSessions limits.
export const LIVE_LOG_COLLECTOR = String.raw`
import base64,json,os,re,selectors,signal,stat,subprocess,sys,time
q=json.loads(base64.b64decode(sys.argv[1]))
scope=q.get('scope','all')
MAX=48
sel=selectors.DefaultSelector()
children=[]
sources=[]
seen=set()
stopping=False
discovery_end=time.monotonic()+20
def emit(v):
    print(json.dumps(v,ensure_ascii=True),flush=True)
def stop(*args):
    global stopping
    stopping=True
signal.signal(signal.SIGTERM,stop)
signal.signal(signal.SIGINT,stop)
def warning(text): emit({'type':'warning','message':text})
def run(args,limit=262144):
    # Bounded subprocess output, including configuration output which never leaves this process.
    if stopping or time.monotonic()>=discovery_end:raise TimeoutError('discovery budget')
    p=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,start_new_session=True)
    selector=selectors.DefaultSelector();selector.register(p.stdout,selectors.EVENT_READ)
    data=bytearray();deadline=min(time.monotonic()+4,discovery_end)
    try:
        while not stopping and time.monotonic()<deadline:
            if selector.select(.1):
                b=os.read(p.stdout.fileno(),8192)
                if not b: return bytes(data),p.wait(timeout=.5)
                data.extend(b)
                if len(data)>limit: raise ValueError('inventory limit')
        raise TimeoutError('inventory timeout')
    finally:
        selector.close()
        if p.poll() is None: os.killpg(p.pid,signal.SIGKILL)
        p.wait();p.stdout.close()
def add(label,kind,args):
    if stopping:return
    key=(kind,label)
    if key in seen:return
    seen.add(key)
    if len(sources)>=MAX:
        warning('سقف ۴۸ منبع رسید؛ برای پوشش بقیه، سرویس یا کانتینر را دقیق انتخاب کنید.');return
    entry={'id':str(len(sources)),'label':label,'kind':kind,'status':'live'}
    try:
        p=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        children.append(p)
        sources.append(entry)
        for pipe,iserr in [(p.stdout,False),(p.stderr,True)]:
            os.set_blocking(pipe.fileno(),False)
            sel.register(pipe,selectors.EVENT_READ,{'entry':entry,'p':p,'error':iserr,'buffer':b'','discard':False})
        emit({'type':'source',**entry})
    except (OSError,ValueError):
        entry['status']='failed';sources.append(entry);emit({'type':'source',**entry})
def path_ok(path):
    return len(path)<=240 and bool(re.fullmatch(r'/var/log/(?:[A-Za-z0-9_@.+-]+/){0,5}[A-Za-z0-9_@.+-]+',path)) and '..' not in path.split('/') and bool(re.search(r'(?:\.log|_log)$',path) or path in ['/var/log/messages','/var/log/syslog','/var/log/secure'])
def file(path,container=None):
    if not path_ok(path):return
    if container:
        # Test canonical regular file inside the container; only fixed commands, not shell text.
        try:
            real,code=run(['docker','exec',container,'readlink','-f','--',path])
            if code or real.decode().strip()!=path:return
            _,code=run(['docker','exec',container,'test','-f',path])
            if code:return
        except (OSError,ValueError,TimeoutError,subprocess.SubprocessError):return
        add('docker:'+container[:12]+':'+path,'file',['docker','exec',container,'timeout','1770','tail','-n','50','-F','--',path]);return
    try:
        if os.path.realpath(path)!=path or not stat.S_ISREG(os.stat(path).st_mode):return
        if not os.access(path,os.R_OK):
            warning('فایل لاگ قابل خواندن نیست: '+path);return
        add(path,'file',['tail','-n','50','-F','--',path])
    except OSError:pass
def nginx_paths(args,container=None):
    try:
        data,code=run(args,2097152)
        # Parse only log destinations; never emit nginx config, headers, certificates or env.
        for index,m in enumerate(re.finditer(rb'(?m)^\s*(?:access_log|error_log)\s+[\x22\x27]?([^\s;\x22\x27]+)',data)):
            if stopping:return
            if index>=64:
                warning('بیش از ۶۴ مقصد لاگ Nginx پیدا شد؛ بررسی تنظیمات محدود است.');break
            path=m.group(1).decode('utf8','replace')
            if path=='off':warning('در بخشی از تنظیمات Nginx ثبت لاگ غیرفعال است؛ برنامه آن را تغییر نمی‌دهد.')
            elif path_ok(path):file(path,container)
            elif path not in ['/dev/stdout','/dev/stderr']:
                warning('یک مقصد لاگ Nginx خارج از مسیرهای امن قابل خواندن است یا مقصد شبکه‌ای/پویا دارد؛ پوشش کامل نیست.')
        if code:warning('خواندن کامل تنظیمات مسیر لاگ Nginx تأیید نشد.')
    except FileNotFoundError:pass
    except (OSError,ValueError,TimeoutError,subprocess.SubprocessError):warning('بررسی مسیرهای تنظیم‌شده Nginx کامل نشد.')
try:
    # Standard file discovery includes virtual-host logs even if default access.log exists but is empty.
    roots=['/var/log'] if scope=='all' else ['/var/log/nginx'] if scope=='nginx' else ['/var/log/apache2','/var/log/httpd']
    paths=[]
    def walk_error(e):warning('بخشی از پوشه‌های لاگ قابل بررسی نیست؛ مجوز حساب را بررسی کنید.')
    for root in roots:
        for directory,dirs,names in os.walk(root,followlinks=False,onerror=walk_error):
            dirs[:]=sorted(d for d in dirs if not os.path.islink(os.path.join(directory,d))) if directory.count('/')-root.count('/')<3 else []
            for name in sorted(names):
                path=os.path.join(directory,name)
                if path_ok(path):paths.append(path)
                if len(paths)>128:break
            if len(paths)>128:break
    if len(paths)>128:warning('فهرست فایل‌های لاگ از سقف بررسی بیشتر است؛ پوشش کامل نیست.')
    # Web logs first, so broad IP queries do not exhaust their budget on auth/system logs.
    for path in sorted(set(paths),key=lambda p:(not bool(re.search(r'nginx|apache|httpd|access',p)),p))[:32]:file(path)
    if len(set(paths))>32:warning('بیش از ۳۲ فایل لاگ پیدا شد؛ فقط ۳۲ فایل اول پایش می‌شوند.')
    if scope in ['all','nginx']:nginx_paths(['nginx','-T'])
    journal=['journalctl','--no-pager','--quiet','--output=json','--follow','--lines=50']
    if scope!='all':journal+=['--unit='+('nginx' if scope=='nginx' else 'apache2')+'.service']
    if q.get('errorsOnly'):journal+=['--priority=0..3']
    add('systemd journal' if scope=='all' else scope+'.service','journal',journal)
    try:
        raw,code=run(['docker','ps','--format','{"ID":"{{.ID}}","Names":"{{.Names}}","Image":"{{.Image}}","Ports":"{{.Ports}}"}'])
        if code:warning('دسترسی به لاگ Docker تأیید نشد؛ پوشش کانتینرها کامل نیست.')
        else:
            rows=raw.decode('utf8').splitlines()
            if len(rows)>100:raise ValueError('container inventory limit')
            containers=[]
            for line in rows:
                d=json.loads(line);cid=d.get('ID','');name=d.get('Names','');image=d.get('Image','');ports=d.get('Ports','')
                if not re.fullmatch('[a-f0-9]{12,64}',cid):raise ValueError('invalid id')
                web=bool(re.search(r'nginx|apache|httpd',name+' '+image,re.I) or re.search(r':(?:80|443)->',ports))
                if scope=='all' or web:containers.append((not web,cid,name))
            containers.sort()
            if len(containers)>12:warning('بیش از ۱۲ کانتینر مرتبط پیدا شد؛ پوشش محدود است. نام کانتینر را مشخص کنید.')
            for _,cid,name in containers[:12]:
                add('docker:'+cid+':'+name,'docker',['docker','logs','--follow','--timestamps','--tail','50',cid])
                if scope in ['all','nginx'] and (_==False):nginx_paths(['docker','exec',cid,'nginx','-T'],cid)
    except FileNotFoundError:pass
    except (OSError,ValueError,TimeoutError,subprocess.SubprocessError):warning('فهرست منابع Docker کامل دریافت نشد.')
    emit({'type':'inventory','count':len(sources)})
    deadline=time.monotonic()+1770;heartbeat=0
    while not stopping and time.monotonic()<deadline and sel.get_map():
        for key,_ in sel.select(.5):
            state=key.data;pipe=key.fileobj;entry=state['entry']
            try:b=os.read(pipe.fileno(),8192)
            except OSError:b=b''
            if not b:
                sel.unregister(pipe);pipe.close()
                if not any(k.data['entry'] is entry for k in sel.get_map().values()):
                    entry['status']='failed';emit({'type':'source',**entry})
                continue
            # Docker stderr is application output. Other stderr is diagnostic, never a matching log.
            if state['error'] and entry['kind']!='docker':
                emit({'type':'diagnostic','id':entry['id']});continue
            buffer=state['buffer']+b
            while b'\n' in buffer:
                line,buffer=buffer.split(b'\n',1)
                if not state['discard'] and len(line)<=16384:
                    emit({'type':'line','id':entry['id'],'line':line.decode('utf8','replace')})
                else:emit({'type':'dropped','id':entry['id']})
                state['discard']=False
            if len(buffer)>16384:state['discard']=True;buffer=b''
            state['buffer']=buffer
        if time.monotonic()-heartbeat>5:
            emit({'type':'heartbeat'});heartbeat=time.monotonic()
finally:
    for p in children:
        if p.poll() is None:
            try:os.killpg(p.pid,signal.SIGTERM)
            except ProcessLookupError:pass
    for p in children:
        try:p.wait(timeout=1)
        except subprocess.TimeoutExpired:
            try:os.killpg(p.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            p.wait()
    sel.close()
`;
