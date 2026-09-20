#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>

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

int main(int argc, char **argv) {
    char cwd[512], elf[512], sel[256];
    if (!getcwd(cwd, sizeof cwd)) strcpy(cwd, "<err>");
    ssize_t n = readlink("/proc/self/exe", elf, sizeof elf - 1);
    if (n < 0) n = 0;
    elf[n] = 0;
    readfile("/proc/self/attr/current", sel, sizeof sel);

    printf("PID=%d\n", (int)getpid());
    printf("UID=%d\n", (int)getuid());
    printf("GID=%d\n", (int)getgid());
    printf("argv0=%s\n", argv[0]);
    printf("exe=%s\n", elf);
    printf("cwd=%s\n", cwd);
    printf("TMPDIR=%s\n", getenv("TMPDIR") ? getenv("TMPDIR") : "<null>");
    printf("LD_LIBRARY_PATH=%s\n", getenv("LD_LIBRARY_PATH") ? getenv("LD_LIBRARY_PATH") : "<null>");
    printf("SELINUX=%s\n", sel);
    fflush(stdout);
    printf("EXEC_OK\n");
    return 0;
}
