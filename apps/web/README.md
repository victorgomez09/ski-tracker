for local build:
```shell
# Check connected Android devices on Windows 11
$ usbipd list
Connected:
BUSID  VID:PID    DEVICE                                               STATE
1-1    1111:1111  S24, SAMSUNG Mobile USB Modem, SAMSUNG Mobile USB...  Not shared

# Forward connected Android device to WSL 2 on Windows 11
# Confirm permission on the Android device when the authorization window appears
$ usbipd bind -b 1-1
$ usbipd attach --wsl=Ubuntu --busid=1-1

# Verify the connected Android device in WSL 2
$ adb devices
List of devices attached
11111111111     device

adb reverse tcp:8082 tcp:8082
```