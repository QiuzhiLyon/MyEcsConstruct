FROM mysql:8.0

COPY init.sql /init.sql

CMD ["sh", "-c", "mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD < /init.sql"]