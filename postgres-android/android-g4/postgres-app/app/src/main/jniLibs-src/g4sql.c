#include <stdio.h>
#include <string.h>
#include <libpq-fe.h>

static PGconn *g_conn;
static void dump(PGresult *r, const char *tag) {
    if (PQresultStatus(r) != PGRES_TUPLES_OK && PQresultStatus(r) != PGRES_COMMAND_OK) {
        printf("%s ERROR: %s\n", tag, PQerrorMessage(g_conn));
        return;
    }
    int rows = PQntuples(r), cols = PQnfields(r);
    for (int i = 0; i < rows; i++) {
        printf("%s row:", tag);
        for (int j = 0; j < cols; j++) printf(" %s", PQgetvalue(r, i, j));
        printf("\n");
    }
}

int main(int argc, char **argv) {
    const char *conn =
        "host=127.0.0.1 port=54329 dbname=postgres user=postgres sslmode=disable";
    PGconn *c = PQconnectdb(conn); g_conn = c;
    if (PQstatus(c) != CONNECTION_OK) {
        printf("CONNFAIL: %s\n", PQerrorMessage(c));
        return 1;
    }
    printf("CONNECTED db=%s user=%s\n", PQdb(c), PQuser(c));
    const char *phase = (argc > 1) ? argv[1] : "phase7";

    PGresult *r = PQexec(c, "select version()");
    dump(r, phase); PQclear(r);

    r = PQexec(c, "select 1");
    dump(r, phase); PQclear(r);

    if (strcmp(phase, "persist") != 0) {
        r = PQexec(c, "drop table if exists g4_apk_test"); PQclear(r);
        r = PQexec(c, "create table g4_apk_test(id bigint primary key, value text not null)"); PQclear(r);
        r = PQexec(c, "insert into g4_apk_test values (1, 'android')"); PQclear(r);
    }
    r = PQexec(c, "select id, value from g4_apk_test");
    dump(r, phase); PQclear(r);

    PQfinish(c);
    printf("SQL_OK\n");
    return 0;
}
