from aiohttp import web, ClientSession
import asyncio

async def proxy_handler(request):
    async with ClientSession() as session:
        # Modify headers here
        headers = dict(request.headers)
        del headers['Host']

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
            # Stream the response back
            proxy_response = web.StreamResponse(
                status=response.status,
                headers=response.headers
            )
            await proxy_response.prepare(request)

            async for chunk in response.content.iter_any():
                await proxy_response.write(chunk)

            return proxy_response

app = web.Application()
app.router.add_route('*', '/{path_info:.*}', proxy_handler)

target_url = ''
port = 5050

if __name__ == '__main__':
    print('Usage:  python reverse_proxy.py [target_url] [proxy_port]')

    import sys
    if (len(sys.argv) < 2):
        print('Please specify target_url')
        sys.exit(1)
    if len(sys.argv) > 1:
        target_url = sys.argv[1]
    if len(sys.argv) > 2:
        port = sys.argv[2]

    print(f'Starting proxy server on port {port} targeting {target_url}...')
    web.run_app(app, port=port)
