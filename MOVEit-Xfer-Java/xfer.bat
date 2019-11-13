@echo off
set JAVAPATH=java.exe
rem -Xdebug -Xrunjdwp:transport=dt_socket,server=y,address="8000" 
%JAVAPATH% -classpath xfer.jar;.\jna.jar -Dfile.encoding=UTF-8 xfer %1 %2 %3 %4 %5 %6 %7 %8 %9