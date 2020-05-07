#!/usr/bin/env python

import ssl
import json
import os
import socket
import BaseHTTPServer, SimpleHTTPServer 
from io import BytesIO
from airplay import AirPlay

default_path = os.path.dirname(os.path.realpath(__file__))
os.chdir(default_path)

ap = AirPlay('127.0.0.1')

intercepted_app = 'kortv'
intercepted_app_host = 'kortv.com'
bind_to_address = ''
server_port = 443 
ssl_key_file = 'certificates/{}.key'.format(intercepted_app)
ssl_certificate_file = 'certificates/{}.pem'.format(intercepted_app)

app_entry_url = 'https://{}/assets/templates/index.xml'
prod_entry_point = 'chichid-atv2.herokuapp.com'
application_js = """
function loadPage (url) {{ var req = new XMLHttpRequest(); req.open('GET', url, true); req.send(); }};
atv.config = {{ doesJavaScriptLoadRoot: true, DEBUG_LEVEL: 4 }};
atv.onAppEntry = function () {{ atv.loadURL('{}'); }}
"""

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

		self.wfile.write(application_js.format(app_entry))
	else:
		self.send_response(404)
		self.end_headers()
		self.wfile.write(b'Hello, world!')

    def do_POST(self):
	if self.path == "/play":
		content_length = int(self.headers['Content-Length'])
		body = json.loads(self.rfile.read(content_length))
		videoURL = body['videoUrl']
		print("attempt to play video " + videoURL)
		ap.play(videoURL)	
		self.send_response(200)
		self.end_headers()
		self.wfile.write("")
	else:
		self.send_response(501)
		self.wfile.write("Not Supported")

httpd = BaseHTTPServer.HTTPServer((bind_to_address, server_port), SimpleHTTPRequestHandler)

httpd.socket = ssl.wrap_socket(
	httpd.socket, 
	server_side=True, 
	keyfile=ssl_key_file, 
	certfile=ssl_certificate_file
)

httpd.serve_forever()
