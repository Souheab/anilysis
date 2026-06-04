{
  description = "Development shell for Anime Six Degrees";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems =
        function:
        nixpkgs.lib.genAttrs systems (
          system:
          function (import nixpkgs { inherit system; })
        );
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs
            pkgs.python311
          ];

          shellHook = ''
            set -e

            if [ ! -x backend/.venv/bin/python ]; then
              python -m venv backend/.venv
            fi

            if ! backend/.venv/bin/python -c 'import fastapi' >/dev/null 2>&1; then
              backend/.venv/bin/python -m pip install -r backend/requirements.txt
            fi

            if [ ! -d frontend/node_modules ]; then
              npm --prefix frontend install
            fi

            echo "Development shell ready. Run ./scripts/start.sh to start the app."
          '';
        };
      });
    };
}
