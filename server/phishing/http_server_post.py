import http.server
import socketserver
import os
import argparse


class MyHandler(http.server.SimpleHTTPRequestHandler):

    upload_directory = None  # set at class level by run_server()

    def do_POST(self):
        """Handle multipart file uploads to /uploads path."""
        if self.path == '/uploads':
            content_type = self.headers.get('Content-Type', '')
            if content_type.startswith('multipart/form-data'):
                boundary = content_type.split("boundary=")[1].encode()
                size = int(self.headers['content-length'])
                data = self.rfile.read(size)

                parts = data.split(boundary)
                for part in parts:
                    if b'filename=' in part:
                        filename_start = part.find(b'filename="') + len(b'filename="')
                        filename_end = part.find(b'"', filename_start)
                        filename = part[filename_start:filename_end].decode()

                        content_start = part.find(b'\r\n\r\n') + len(b'\r\n\r\n')
                        content_end = part.rfind(b'\r\n--')
                        file_content = part[content_start:content_end]

                        os.makedirs(self.upload_directory, exist_ok=True)
                        save_path = os.path.join(self.upload_directory, filename)
                        with open(save_path, 'wb') as f:
                            f.write(file_content)

                        print(f"[HTTP] Uploaded: {filename} → {save_path}")
                        self.send_response(200)
                        self.send_header('Content-type', 'text/html')
                        self.end_headers()
                        self.wfile.write(f"File '{filename}' uploaded successfully!".encode())
                        return

            self.send_response(400)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b"No file uploaded or invalid content type.")
        else:
            self.send_response(400)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b"POST only supported at /uploads")

    def do_GET(self):
        """Serve files from host_directory."""
        super().do_GET()

    def log_message(self, format, *args):
        """Override to prefix server logs for clarity."""
        print(f"[HTTP] {self.address_string()} - {format % args}")


def run_server():
    parser = argparse.ArgumentParser(description="Start a simple HTTP server.")
    parser.add_argument(
        "--host_directory",
        type=str,
        default=os.getcwd(),
        help="Directory to serve files from (default: cwd)"
    )
    parser.add_argument(
        "--upload_directory",
        type=str,
        default=os.path.join(os.getcwd(), 'uploads'),
        help="Directory to save uploaded files (default: cwd/uploads)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=9008,
        help="Port to listen on (default: 9008)"
    )

    args = parser.parse_args()

    os.makedirs(args.upload_directory, exist_ok=True)
    os.chdir(args.host_directory)  # safe: isolated subprocess

    MyHandler.upload_directory = args.upload_directory

    print(f"[HTTP] Host directory:   {args.host_directory}")
    print(f"[HTTP] Upload directory: {os.path.abspath(args.upload_directory)}")
    print(f"[HTTP] Listening on port {args.port}")

    with socketserver.TCPServer(("", args.port), MyHandler) as httpd:
        httpd.serve_forever()


if __name__ == '__main__':
    run_server()