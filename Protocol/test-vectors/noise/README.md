# Noise test vectors

`cacophony-subset.json` contains, unchanged, the two vectors Wilco's secure channel uses
(`Noise_XXpsk3_25519_ChaChaPoly_SHA256` for pairing and `Noise_IK_25519_ChaChaPoly_SHA256`
for reconnecting), taken from the cacophony project's `vectors/cacophony.txt` at commit
`8ee9d41e34a1a596cfa3ab12aa4069ff87dc1247` (https://github.com/haskell-cryptography/cacophony). Cacophony's vectors are
released into the public domain.

Every Wilco implementation of the secure channel must reproduce them byte for byte.
