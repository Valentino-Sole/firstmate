#!/usr/bin/env bash
set -u
run() { # <label> <name> <manifest-line> [post-setup]
  POST_SETUP=${4:-} timeout 300 bash /tmp/fm-ev/demo.sh "$2" "$3" 2>&1
}
echo "=== A) surplus 5th column (the reported incident shape) ==="
run "$1" "$1-A" 'task-x1\tident-x1\t12\t0\tstray\n'
echo "=== B) surplus column hidden behind an EMPTY column (IFS-TAB collapse) ==="
run "$1" "$1-B" 'task-x1\tident-x1\t12\t0\ntask-hidden\tident-h\t7\t\t99\n'
echo "=== C) tolerated legacy 3-field row (pre-d977128), lossless upgrade ==="
run "$1" "$1-C" 'task-x1\tident-x1\t12\t0\ntask-legacy\tident-l\t7\n'
echo "=== D) manifest itself unusable: symlink ==="
run "$1" "$1-D" 'task-x1\tident-x1\t12\t0\n' \
  'ln -sf "$case_dir/elsewhere" "$case_dir/state/.status-presentation-cursor"; printf "task-x1\tident-x1\t12\t0\n" > "$case_dir/elsewhere"'
