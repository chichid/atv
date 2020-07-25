FROM jrottenberg/ffmpeg:3.3-alpine
FROM node:12

COPY --from=0 / /

RUN mkdir -p ~/.local/atv
RUN cd ~/.local/atv
WORKDIR ~/.local/atv

COPY ./packages/transcoder ./packages/transcoder
COPY package*.json ./
RUN npm install
COPY lerna.json ./
RUN npm run postinstall

COPY . .

EXPOSE 8666
RUN npm run build -- --scope transcoder
CMD ["npm", "start", "--", "--scope", "transcoder"]
