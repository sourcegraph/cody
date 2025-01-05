from aiohttp import web, ClientSession
from urllib.parse import urlparse
import asyncio

target_url = ''
port = 5050

async def proxy_handler(request):
    async with ClientSession(auto_decompress=False) as session:
        print(f'Request to: {request.url}')

        # Modify headers here
        headers = dict(request.headers)

        # Reset the Host header to use target server host instead of the proxy host
        if 'Host' in headers:
            headers['Host'] = urlparse(target_url).netloc.split(':')[0]

        # 'chunked' encoding results in error 400 from Cloudflare, removing it still keeps response chunked anyway
        if 'Transfer-Encoding' in headers:
            del headers['Transfer-Encoding']

        # Use value of 'Authorization: Bearer' to fill 'X-Forwarded-User' and remove 'Authorization' header
        if 'Authorization' in headers:
            values = headers['Authorization'].split()
            if values and values[0] == 'Bearer':
                headers['X-Forwarded-User'] = values[1]
            del headers['Authorization']

        # Forward the request to target
        async with session.request(
            method=request.method,
            url=f'{target_url}{request.path_qs}',
            headers=headers,
            data=await request.read()
        ) as response:
            proxy_response = web.StreamResponse(
                status=response.status,
                headers=response.headers
            )

            await proxy_response.prepare(request)

            # Stream the response back
            async for chunk in response.content.iter_chunks():
                await proxy_response.write(chunk[0])

            await proxy_response.write_eof()
            return proxy_response

app = web.Application()
app.router.add_route('*', '/{path_info:.*}', proxy_handler)


if __name__ == '__main__':
    print('Usage:  python reverse_proxy.py [target_url] [proxy_port]')

    import sys
    if (len(sys.argv) < 2):
        print('Please specify target_url')
        sys.exit(1)
    if len(sys.argv) > 1:
        target_url = sys.argv[1]
    if len(sys.argv) > 2:
        port = int(sys.argv[2])

    print(f'Starting proxy server on port {port} targeting {target_url}...')
    web.run_app(app, port=port)
