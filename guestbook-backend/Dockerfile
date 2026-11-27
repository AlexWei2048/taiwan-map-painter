FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 GUESTBOOK_DB=/data/guestbook.sqlite3
WORKDIR /app
RUN groupadd --gid 10001 guestbook && useradd --uid 10001 --gid 10001 --no-create-home guestbook
COPY server.py test_guestbook.py start-container.py ./
RUN python -m unittest -v test_guestbook
EXPOSE 8787
CMD ["python","start-container.py"]
