{
  description = "Anilysis";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };

          python = pkgs.python3.withPackages (
            ps: with ps; [
              fastapi
              uvicorn
              sqlmodel
              sqlalchemy
              networkx
              httpx
            ]
          );

          frontend = pkgs.buildNpmPackage {
            pname = "anilysis-frontend";
            version = "0.1.0";
            src = ./frontend;
            npmDepsHash = "sha256-XwtZ/veOrqIPcACwYMnpAaN92YWXXqWAQAer50UUYWw=";
            env.VITE_API_BASE_URL = "";
            installPhase = ''
              runHook preInstall
              cp -r dist $out
              runHook postInstall
            '';
          };

          anilysis = pkgs.writeShellApplication {
            name = "anilysis";
            runtimeInputs = [ python ];
            text = ''
              export PYTHONPATH=${./backend}
              export ANILYSIS_STATIC_DIR=${frontend}
              export BACKEND_HOST="''${BACKEND_HOST:-127.0.0.1}"
              export BACKEND_PORT="''${BACKEND_PORT:-8000}"

              echo "Anilysis: http://$BACKEND_HOST:$BACKEND_PORT"
              exec uvicorn app.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT"
            '';
          };
        in
        {
          default = anilysis;
          inherit anilysis frontend;
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${nixpkgs.lib.getExe self.packages.${system}.default}";
        };
      });

      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          python = pkgs.python3.withPackages (
            ps: with ps; [
              fastapi
              uvicorn
              sqlmodel
              sqlalchemy
              networkx
              httpx
              pytest
              pytest-asyncio
              pytest-httpx
            ]
          );
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs
              python
            ];

            shellHook = ''
              echo "Development shell ready. Dependencies are provided by Nix."
              echo "Run ./scripts/start.sh after npm install, or use nix run for the packaged app."
            '';
          };
        }
      );
    };
}
