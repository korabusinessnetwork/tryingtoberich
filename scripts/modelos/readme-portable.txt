KORA STREAM GAMES
=================

There are two files in this folder, and they are the SAME program:

  KoraStreamGames.exe             the portable version, no install
  KoraStreamGames-Setup-<v>.exe   the installer

WHICH ONE? If you are going to use this for real, use the installer: it
creates the shortcuts and it is the only one that updates itself. The
portable one is for trying it out without touching your machine, and for
carrying it on a USB stick.

(The latest.yml sitting next to them belongs to the auto-updater. You do
not need it to install, so you can ignore it.)


GETTING STARTED
---------------

1. Double-click whichever file you picked.

   The first time, Windows may show a blue screen that says
   "Windows protected your PC". That is NOT a virus warning: Microsoft
   Defender SmartScreen says this about every new program that has not
   paid for a code signing certificate yet. Click "More info", then
   "Run anyway".

2. If you picked the installer, it asks where to install and installs.
   It never asks for an administrator password, because it installs for
   your user only. It opens the program at the end, and leaves shortcuts
   on your desktop and in the Start menu.

   If you picked the portable one, the program opens straight away. The
   first launch takes a few seconds longer than the ones after it.

3. The program opens in an ordinary Windows window, with its own icon in
   the taskbar. Closing the window shuts the game down, so leave it open
   while you are live.

4. Enter your TikTok @handle and build your preset.


WHAT YOU NEED ON THE MACHINE (once, and only once)
--------------------------------------------------

The game runs inside Roblox Studio, on your machine. These two are
third-party programs with their own installers. Kora Stream Games does
not install either one for you:

  * Roblox Studio
      https://create.roblox.com/  ->  "Start Creating"
      Sign in with your Roblox account.

  * Rojo (this is what builds the game inside Studio)
      Open PowerShell and run:
          winget install Rojo.Rojo
      Then CLOSE that terminal and open a new one, or Rojo will not be
      found.

      No winget? Download it from
      https://github.com/rojo-rbx/rojo/releases and put rojo.exe in a
      folder that is on your PATH.

With both installed, the "Game" tab has an "Open the game in Studio"
button that builds the place and opens Studio on it. All you do is hit
Play. If Rojo is missing, the program tells you and repeats the command
above.


WHERE YOUR FILES LIVE
---------------------

  .env       your settings and your token. It belongs to THIS install:
             do not copy it to another machine.
  data/      everything that is yours: presets, media, stream history.
  game/      the game source that Rojo builds inside Studio.
  kora.log   what happened the last time the program started. First
             place to look when something goes wrong.

IN THE PORTABLE VERSION they appear in the same folder as
KoraStreamGames.exe.

IN THE INSTALLED VERSION they live in your user profile, outside the
program folder, so that uninstalling can never delete your work. To get
there, copy the line below, paste it into the File Explorer address bar
and press Enter:

    %APPDATA%\Kora Stream Games

TO BACK UP, copy the data/ folder. That is the whole procedure.

If you were using the portable version and switched to the installed one,
the program brings your files across by itself on the first launch. Do
not delete the old folder before you have checked that everything is
there.


UPDATES
-------

IN THE INSTALLED VERSION this is automatic. The program looks for a new
version shortly after it starts, downloads it in the background, and
installs it WHEN YOU CLOSE the program. Never mid-stream, never
interrupting anything. The next time you open it, it is the new version.

If the machine is offline, nothing happens and nothing appears on screen.

IN THE PORTABLE VERSION it is manual: replace KoraStreamGames.exe with
the new one, in the same folder. Your data/ and .env stay where they are
and nothing is lost. The game/ folder updates itself to match the new
version.


UNINSTALLING
------------

Installed version: Windows Settings -> Apps -> Installed apps -> Kora
Stream Games -> Uninstall. Your presets, media and history are NOT
deleted; they stay in %APPDATA%\Kora Stream Games.

Portable version: delete the folder. There is nothing anywhere else.


WHEN SOMETHING GOES WRONG
-------------------------

If the program will not open, it shows a box with the reason. The full
detail is in kora.log, next to your files (see above).

"Kora Stream Games is already running": open Task Manager and end the one
that is running, or restart the machine.

The screen froze: press F5 to reload.
