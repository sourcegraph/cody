from aiohttp import web, ClientSession
import asyncio

async def proxy_handler(request):
    # target_url = 'https://piotr-kukielka.sgdev.dev'

    async with ClientSession() as session:
        # Modify headers here
        headers = dict(request.headers)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }

        headers.pop('Authorization', None)
        headers['X-Forwarded-User'] = 'pkukielka'

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

target_url = 'https://piotr-kukielka.sgdev.dev'
port = 5050

if __name__ == '__main__':
    print('Usage:  python reverse_proxy.py [target_url] [proxy_port]')

    import sys
    if len(sys.argv) > 1:
        target_url = sys.argv[1]
    if len(sys.argv) > 2:
        port = sys.argv[2]

    print(f'Starting proxy server on port {port} targeting {target_url}...')
    web.run_app(app, port=port)
