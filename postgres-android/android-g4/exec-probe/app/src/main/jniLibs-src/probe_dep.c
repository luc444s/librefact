#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>

const char *g4dep_hello(void);

static void readfile(const char *p, char *buf, size_t n) {
    int fd = open(p, O_RDONLY);
    if (fd < 0) { snprintf(buf, n, "<err>"); return; }
    ssize_t r = read(fd, buf, n - 1);
    if (r < 0) r = 0;
    buf[r] = 0;
    close(fd);
    char *x = strchr(buf, '\n');
    if (x) *x = 0;
}

int main(void) {
    char sel[256];
    readfile("/proc/self/attr/current", sel, sizeof sel);
    printf("PID=%d\n", (int)getpid());
    printf("UID=%d\n", (int)getuid());
    printf("SELINUX=%s\n", sel);
    printf("DEP=%s\n", g4dep_hello());
    printf("LINK_OK\n");
    return 0;
}
