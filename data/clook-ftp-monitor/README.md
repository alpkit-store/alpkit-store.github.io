# FTP Upload Monitor

A lightweight dashboard for monitoring FTP uploads on cPanel servers with Pure-FTPd.

## Features

- Real-time tracking of all FTP uploads
- Filter by username or filename
- Summary statistics (total uploads, last 24h, unique users, total data)
- Summary by filename (upload count, total size, users, last uploaded)
- Daily totals with anomaly detection (highlights unusual activity)
- Sortable columns on all tables
- Copy-to-clipboard for file paths
- Auto-refresh every 60 seconds
- Last FTP upload timestamp
- Authenticated via existing PHP session system (no separate login required)
- JSON data stored outside web root for security

## File Structure

```
/home/xxxxxxxx/ftpmonitor/
├── ftp_log_parser.py      # Log parser script
├── ftp_uploads.json       # Upload data (auto-generated, outside web root)
├── parser.log             # Parser execution log
└── .htpasswd              # (unused - auth handled by PHP sessions)

/home/xxxxxxxx/public_html/ftp-monitor/
├── ftp_dashboard.php      # Web dashboard (PHP session auth required)
└── ftp_data.php           # Authenticated JSON data endpoint
```

## Installation

### 1. Create directories

```bash
mkdir -p /home/xxxxxxxx/ftpmonitor
mkdir -p /home/xxxxxxxx/public_html/ftp-monitor
```

### 2. Set correct ownership

```bash
chown xxxxxxxx:xxxxxxxx /home/xxxxxxxx/ftpmonitor
chown xxxxxxxx:xxxxxxxx /home/xxxxxxxx/public_html/ftp-monitor
```

### 3. Make `/var/log/messages` readable

```bash
chmod 644 /var/log/messages
```

To persist this after log rotation, add `create 0644 root root` to `/etc/logrotate.d/syslog`:

```bash
sed -i 's/missingok/missingok\n    create 0644 root root/' /etc/logrotate.d/syslog
```

### 4. Deploy files

Upload to the server:
- `ftp_log_parser.py` → `/home/xxxxxxxx/ftpmonitor/`
- `ftp_dashboard.php` → `/home/xxxxxxxx/public_html/ftp-monitor/`
- `ftp_data.php` → `/home/xxxxxxxx/public_html/ftp-monitor/`

### 5. Run initial parse

```bash
python3 /home/xxxxxxxx/ftpmonitor/ftp_log_parser.py
```

### 6. Set up cron job (under xxxxxxxx user)

```bash
crontab -e -u xxxxxxxx
```

Add:

```
*/5 * * * * /usr/bin/python3 /home/xxxxxxxx/ftpmonitor/ftp_log_parser.py >> /home/xxxxxxxx/ftpmonitor/parser.log 2>&1
```

### 7. Access the dashboard

```
https://yourdomain.com/ftp-monitor/ftp_dashboard.php
```

Requires an active session from the existing reporting login at `account_login.php`.

## How It Works

1. **Log Parser**: Reads `/var/log/messages` and extracts Pure-FTPd upload events
2. **Data Storage**: Stores upload records in JSON at `/home/xxxxxxxx/ftpmonitor/ftp_uploads.json` (outside web root, keeps last 1000 records)
3. **Data Endpoint**: `ftp_data.php` validates the PHP session then serves the JSON with correct `Last-Modified` headers
4. **Dashboard**: `ftp_dashboard.php` checks PHP session auth, then fetches data from `ftp_data.php`
5. **Cron Job**: Runs the parser every 5 minutes under the `xxxxxxxx` user

## Configuration

### Parser

Edit `/home/xxxxxxxx/ftpmonitor/ftp_log_parser.py`:

```python
LOG_FILE = "/var/log/messages"                      # Source log file
DATA_FILE = "/home/xxxxxxxx/ftpmonitor/ftp_uploads.json"  # Output JSON
MAX_RECORDS = 1000                                  # Records to keep
```

### Dashboard auto-refresh

Edit `ftp_dashboard.php` to change the refresh interval:

```javascript
setInterval(loadData, 60000);  // milliseconds
```

## Security

- `ftp_uploads.json` is stored outside the web root — not directly accessible via browser
- `ftp_data.php` validates the PHP session before serving any data, returning 401 if unauthenticated
- `ftp_dashboard.php` redirects unauthenticated users to `account_login.php`
- Auth reuses the existing session system (groups: Admin, User, Business, Despatch)
- Dashboard is read-only

## Troubleshooting

### No uploads showing

1. Verify Pure-FTPd logging is enabled:
   ```bash
   grep VerboseLog /etc/pure-ftpd.conf
   # Should show: VerboseLog yes
   ```

2. Confirm uploads are being logged:
   ```bash
   grep "uploaded" /var/log/messages | tail -5
   ```

3. Check the parser log:
   ```bash
   cat /home/xxxxxxxx/ftpmonitor/parser.log
   ```

4. Run the parser manually as the cron user to test:
   ```bash
   su -s /bin/bash xxxxxxxx -c "/usr/bin/python3 /home/xxxxxxxx/ftpmonitor/ftp_log_parser.py"
   ```

### Dashboard shows "Failed to load data"

1. Check the JSON file exists:
   ```bash
   ls -la /home/xxxxxxxx/ftpmonitor/ftp_uploads.json
   ```

2. Check file permissions (must be readable by xxxxxxxx):
   ```bash
   chmod 644 /home/xxxxxxxx/ftpmonitor/ftp_uploads.json
   ```

3. Open browser console (F12) and check for errors

### Cron not running

1. Verify the cron entry:
   ```bash
   crontab -l -u xxxxxxxx
   ```

2. Check directory ownership (xxxxxxxx must own ftpmonitor to write parser.log):
   ```bash
   ls -la /home/xxxxxxxx/ | grep ftpmonitor
   ```

3. Test manually as xxxxxxxx user:
   ```bash
   su -s /bin/bash xxxxxxxx -c "/usr/bin/python3 /home/xxxxxxxx/ftpmonitor/ftp_log_parser.py"
   ```

## Sample Record

```json
{
  "timestamp": "2026-04-03T11:18:37",
  "username": "user@example.com",
  "ip_address": "xxx.xxx.xxx.xxx",
  "filepath": "/home/xxxxxxxx/public_html/path/to/file.csv",
  "filename": "Orders.csv",
  "bytes": 18677,
  "size_mb": 0.02,
  "speed": "686.02KB/sec"
}
```
