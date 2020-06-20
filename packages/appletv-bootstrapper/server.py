#!/usr/bin/env python

import ssl
import json
import os
import socket
import urllib
import urlparse
import thread
import time 
import BaseHTTPServer, SimpleHTTPServer 
from io import BytesIO
from airplay import AirPlay

default_path = os.path.dirname(os.path.realpath(__file__))
os.chdir(default_path)

intercepted_app = 'kortv'
intercepted_app_host = 'kortv.com'
bind_to_address = ''
http_server_port = 8080 
ssl_server_port = 443 
ssl_key_file = 'certificates/{}.key'.format(intercepted_app)
ssl_certificate_file = 'certificates/{}.pem'.format(intercepted_app)

app_entry_url = 'https://{}/tv-service/templates/index.xml'
prod_entry_point = 'tv-service.herokuapp.com'
application_js = open('application.js', 'r').read(); 

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
	else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Resource {} not found'.format(self.path))

    def do_POST(self):
	if self.path == "/play":
            content_length = int(self.headers['Content-Length'])
            body = json.loads(self.rfile.read(content_length))
            videoURL = body['videoUrl']
            print("attempt to play video " + videoURL)
            ap.play(videoURL)	
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write('Playing {}'.format(videoURL))
	else:
            self.send_response(501)
            self.wfile.write('Not Supported')

def init_server(http):
	if http:
		httpd = BaseHTTPServer.HTTPServer((bind_to_address, http_server_port), SimpleHTTPRequestHandler)
	else:
		httpd = BaseHTTPServer.HTTPServer((bind_to_address, ssl_server_port), SimpleHTTPRequestHandler)
		httpd.socket = ssl.wrap_socket( httpd.socket, server_side=True, keyfile=ssl_key_file, certfile=ssl_certificate_file)

	httpd.serve_forever()

thread.start_new_thread(init_server, (True, ))
thread.start_new_thread(init_server, (False, ))

while 1:
    time.sleep(10)

