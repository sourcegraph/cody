FROM ubuntu:24.04


RUN apt-get update && apt-get install -y nodejs npm libsecret-tools gnome-keyring
RUN npm install -g @sourcegraph/cody

CMD ["/bin/bash"]
