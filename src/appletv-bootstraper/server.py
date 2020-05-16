#!/usr/bin/env python

import ssl
import json
import os
import socket
import urllib
import urlparse
import BaseHTTPServer, SimpleHTTPServer 
from io import BytesIO
from airplay import AirPlay

default_path = os.path.dirname(os.path.realpath(__file__))
os.chdir(default_path)

intercepted_app = 'kortv'
intercepted_app_host = 'kortv.com'
bind_to_address = ''
server_port = 443 
ssl_key_file = 'certificates/{}.key'.format(intercepted_app)
ssl_certificate_file = 'certificates/{}.pem'.format(intercepted_app)

app_entry_url = 'https://{}/assets/templates/index.xml'
prod_entry_point = 'chichid-atv2.herokuapp.com'
application_js = open('application.js', 'r').read(); 

wrap_video_template = """#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-VERSION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
{{VIDEO}}
#EXT-X-ENDLIST"""

ap = AirPlay('127.0.0.1')

class SimpleHTTPRequestHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
    def do_GET(self):
	if self.path == "/appletv/js/application.js":
            app_entry = ''
            is_prod = socket.gethostbyname(intercepted_app_host) == '127.0.0.1'

            if is_prod: 
                    app_entry = app_entry_url.format(prod_entry_point)
            else:
                    app_entry = app_entry_url.format(intercepted_app_host)
            
            self.send_response(200)
            self.end_headers()

            self.wfile.write(application_js.replace('{{config.MainTemplate}}', app_entry))
        elif "/wrapVideo" in self.path:
            parsed = urlparse.urlparse(self.path)
            video_url = urlparse.parse_qs(parsed.query)['url'][0]
            print('wrapping ' + video_url)

            self.send_response(200)
            self.send_header('Content-Type', 'application/vnd.apple.mpegurl')
            self.end_headers()
            self.wfile.write(wrap_video_template.replace('{{VIDEO}}', video_url))
	else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Resource {} not found'.format(self.path))

    def do_POST(self):
	if self.path == "/play":
            content_length = int(self.headers['Content-Length'])
            body = json.loads(self.rfile.read(content_length))
            videoURL = urllib.quote(body['videoUrl'])
            print("attempt to play video " + videoURL)
            ap.play("https://127.0.0.1/wrapVideo?url=" + videoURL)	
            self.send_response(200)
            self.end_headers()
            self.wfile.write('Playing {}'.format(videoURL))
	else:
            self.send_response(501)
            self.wfile.write('Not Supported')

httpd = BaseHTTPServer.HTTPServer((bind_to_address, server_port), SimpleHTTPRequestHandler)

httpd.socket = ssl.wrap_socket(
	httpd.socket, 
	server_side=True, 
	keyfile=ssl_key_file, 
	certfile=ssl_certificate_file
)

httpd.serve_forever()
