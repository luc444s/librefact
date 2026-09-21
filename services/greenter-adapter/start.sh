#!/bin/bash
cd /home/lucas/Proyectos/librefact/services/greenter-adapter
exec php -d display_errors=1 -d error_reporting=E_ALL -S 0.0.0.0:8099 router.php
