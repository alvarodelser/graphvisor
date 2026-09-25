"""Admin commands, for bootstrapping (the first admin code) and recovery.

  docker exec graphvisor-worker python -m app.manage create-code --label "OEG admins" --role admin
  docker exec graphvisor-worker python -m app.manage create-code --label "IRB" --role evaluator --collections sci_corpus
  docker exec graphvisor-worker python -m app.manage list-codes
  docker exec graphvisor-worker python -m app.manage disable-code <uid>
  docker exec graphvisor-worker python -m app.manage set-password <email>
"""

import argparse
import json

from app.auth import service
from app.shared import neo4j


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m app.manage")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-code")
    c.add_argument("--label", required=True)
    c.add_argument("--role", choices=service.ROLES, required=True)
    c.add_argument("--collections", default="", help="comma-separated names, or * for all")
    sub.add_parser("list-codes")
    d = sub.add_parser("disable-code")
    d.add_argument("uid")
    s = sub.add_parser("set-password", help="gives the user a temporary password")
    s.add_argument("email")
    args = p.parse_args()

    if args.cmd == "create-code":
        cols = [x.strip() for x in args.collections.split(",") if x.strip()]
        code, record = service.create_code(args.label, args.role, cols)
        print(f"{code}   ({record['label']}, {record['role']}, collections: {', '.join(record['collections'])})")
        print("This is the only time the code is shown.")
    elif args.cmd == "list-codes":
        for k in service.list_codes():
            print(json.dumps(k, ensure_ascii=False))
    elif args.cmd == "disable-code":
        print(service.update_code(args.uid, disabled=True))
    elif args.cmd == "set-password":
        rows = neo4j.read("MATCH (u:User {email: $e}) RETURN u.uid AS uid", e=args.email.strip().lower())
        if not rows:
            raise SystemExit(f"no user {args.email}")
        print("temporary password:", service.reset_password(rows[0]["uid"]),
              "(to be changed at the next login)")


if __name__ == "__main__":
    main()
