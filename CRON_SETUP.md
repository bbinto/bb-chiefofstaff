# Daily Brief Cron Setup

This directory contains scripts to automate the daily brief workflow.

## Overview

The automated workflow:
1. Generates a daily brief report using `npm start daily-brief`
2. Creates a light version of the report using `npm run light -- <filename>`
3. Generates a podcast from the light version using `sh podcast.sh <filename>-light`

## Files

- **daily-brief-cron.sh** - Main cron script that runs the workflow
- **setup-daily-cron.sh** - Interactive setup script to configure the cronjob
- **logs/daily-brief-cron.log** - Log file with execution history

## Quick Setup

Run the interactive setup script:

```bash
./setup-daily-cron.sh
```

This will prompt you for:
- The hour to run (0-23)
- The minute to run (0-59)

Example: To run daily at 8:00 AM, enter `8` for hour and `0` for minute.

## Manual Setup

If you prefer to set up the cronjob manually:

1. Edit your crontab:
   ```bash
   crontab -e
   ```

2. Add the following line (adjust time as needed):
   ```
   0 8 * * * cd /home/pi/Documents/GitHub/bb-chiefofstaff && /home/pi/Documents/GitHub/bb-chiefofstaff/daily-brief-cron.sh
   ```

   This runs at 8:00 AM daily. Adjust `0 8` to your preferred time (minute hour).

## Viewing Logs

Check the log file to see execution history:

```bash
tail -f logs/daily-brief-cron.log
```

Or view the entire log:

```bash
cat logs/daily-brief-cron.log
```

## Testing the Script

To test the script manually before setting up the cron:

```bash
./daily-brief-cron.sh
```

This will run the complete workflow and show you the output.

## Removing the Cronjob

To remove the cronjob:

1. Edit your crontab:
   ```bash
   crontab -e
   ```

2. Remove the line containing `daily-brief-cron.sh`

3. Save and exit

Or use the setup script again to remove it.

## Troubleshooting

### Cronjob not running

1. Check if cron service is running:
   ```bash
   sudo systemctl status cron
   ```

2. Verify your crontab entry:
   ```bash
   crontab -l
   ```

3. Check the log file for errors:
   ```bash
   tail -20 logs/daily-brief-cron.log
   ```

### Reports not generating

- Ensure the project dependencies are installed: `npm install`
- Verify your environment variables are set in `.env`
- Check that API keys and configurations are correct
- Run the script manually to see detailed error messages

### Podcast not generating

- Verify the md-to-podcast path is correct in `podcast.sh`
- Ensure the podcast generation dependencies are installed
- Check that the light version was created successfully

## Cron Time Format

The cron time format is: `minute hour day month weekday`

Examples:
- `0 8 * * *` - 8:00 AM every day
- `30 9 * * *` - 9:30 AM every day
- `0 8 * * 1` - 8:00 AM every Monday
- `0 8 1 * *` - 8:00 AM on the 1st of every month
- `0 8 * * 1-5` - 8:00 AM Monday through Friday

## Notes

- The script automatically creates logs in the `logs/` directory
- Each run is timestamped in the log file
- The script will exit with error if any step fails
- Ensure sufficient disk space for reports and podcasts
