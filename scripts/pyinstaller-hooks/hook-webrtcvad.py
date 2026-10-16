"""Bundle the native webrtcvad extension without its mismatched package metadata.

``webrtcvad-wheels`` provides the import module ``webrtcvad``, but its
distribution metadata has a different name. The default PyInstaller community
hook attempts to copy metadata for a distribution named ``webrtcvad`` and
fails on Windows. The runtime does not need that metadata.
"""

hiddenimports = ["_webrtcvad"]
