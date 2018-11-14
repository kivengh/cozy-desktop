FROM microsoft/windowsservercore

# Switch the default shell used with RUN to PowerShell
SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop';"]

#RUN Install-Module BetterTls -Scope CurrentUser
#RUN Import-Module BetterTls
#RUN Enable-Tls -Tls11 -Tls12
RUN [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 ; \
    curl -UseBasicParsing -Uri "https://dl.bintray.com/apache/couchdb/win/2.2.0/couchdb-2.2.0.msi" -OutFile "C:\apache-couchdb-2.2.0.msi"

# Stop & remove the service that the .msi installs (there are no properties exposed by the .msi to prevent it in the first place)
# We need empty data and log directories to be able make those volumes under Windows but they have contents due to the service having run.
# I was unable to remove the .delete directory in the data directory, so renaming the directories was the easiest solution
# Also bind couchdb to other than localhost
RUN Start-Process 'C:\Windows\System32\msiexec.exe' -ArgumentList '/i C:\apache-couchdb-2.2.0.msi /qn' -wait ; \
    Remove-Item 'C:\apache-couchdb-2.2.0.msi' ; \
	C:\couchdb\bin\nssm.exe stop 'Apache CouchDB' > $null ; \
	C:\couchdb\bin\nssm.exe remove 'Apache CouchDB' confirm > $null ; \
	mv C:\couchdb\data C:\couchdb\_data ; \
	mv C:\couchdb\var\log C:\couchdb\var\_log ; \
	New-Item -Path C:\couchdb\data -Type directory > $null ; \
	New-Item -Path C:\couchdb\var\log -Type directory > $null ; \
    Copy-Item C:/CouchDB/etc/local.ini C:/CouchDB/etc/local.ini.orig ; \
    cat C:/CouchDB/etc/local.ini.orig | % { $_ -replace ';bind_address = 127.0.0.1', 'bind_address = 0.0.0.0' } | Out-File C:/CouchDB/etc/local.ini -encoding ASCII


WORKDIR C:/CouchDB/

VOLUME C:/couchdb/data
VOLUME C:/couchdb/var/log

EXPOSE 5984

CMD ./bin/couchdb.cmd

