import math, struct, zlib
from pathlib import Path

def png(size):
    data = bytearray()
    samples = 3
    for y in range(size):
        data.append(0)
        for x in range(size):
            rgba = [0, 0, 0, 0]
            for sy in range(samples):
                for sx in range(samples):
                    u=(x+(sx+.5)/samples)/size
                    v=(y+(sy+.5)/samples)/size
                    dx=max(abs(u-.5)-.30,0);dy=max(abs(v-.5)-.30,0)
                    inside=dx*dx+dy*dy < .17*.17
                    c=(25,47,42,255) if inside else (0,0,0,0)
                    a=(u-.5)*math.cos(-.50)-(v-.5)*math.sin(-.50)
                    b=(u-.5)*math.sin(-.50)+(v-.5)*math.cos(-.50)
                    orbit=math.sqrt((a/.31)**2+(b/.16)**2)
                    radius=math.hypot(u-.5,v-.5)
                    if inside and (abs(orbit-1)<.09 or radius<.075): c=(214,231,183,255)
                    if math.hypot(u-.75,v-.31)<.046: c=(242,244,230,255)
                    for i in range(4):rgba[i]+=c[i]
            data.extend(round(a/(samples*samples)) for a in rgba)
    def chunk(kind,content):return struct.pack('>I',len(content))+kind+content+struct.pack('>I',zlib.crc32(kind+content)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(data,9))+chunk(b'IEND',b'')

root=Path(__file__).parent
sizes=[16,32,48,256]
images=[png(s) for s in sizes]
(root/'icon.png').write_bytes(images[-1])
offset=6+16*len(images)
entries=[]
for size,im in zip(sizes,images):
    entries.append(struct.pack('<4B2H2I',size%256,size%256,0,0,1,32,len(im),offset))
    offset+=len(im)
(root/'icon.ico').write_bytes(struct.pack('<3H',0,1,len(images))+b''.join(entries)+b''.join(images))
