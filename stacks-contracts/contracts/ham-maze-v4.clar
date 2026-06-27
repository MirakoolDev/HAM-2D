;; HAM Maze - Daily Maze Game on Stacks (v3)
;; Implements SIP-009 NFT standard, daily prize pool, ECDSA settlement, and tiered payouts

(impl-trait 'SP2PABVDX0JZSZZNX5VCRB8PEYW13KDB7QJ7E663B.nft-trait.nft-trait)

(define-non-fungible-token ham-run uint)

;; Constants
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-already-settled (err u102))
(define-constant err-not-token-owner (err u103))
(define-constant err-invalid-signature (err u104))
(define-constant err-invalid-winners (err u105))
(define-constant err-paused (err u106))

;; Variables
(define-data-var is-paused bool false)
(define-data-var last-token-id uint u0)
(define-data-var contract-owner principal tx-sender)
(define-data-var mint-fee uint u1000000) ;; 1 STX
(define-data-var server-pubkey (buff 33) 0x029d5cce548dc2f2df51d364c7af72bd0b63b59a655d6730ad7fcab5be70921b75)

;; Maps
;; maze-id -> total prize pool in uSTX
(define-map maze-prize-pools uint uint)
;; maze-id -> has it been settled?
(define-map maze-settled uint bool)

;; maze-id -> on-chain booster info
(define-map daily-boosters uint {
  contract: principal,
  multiplier: uint
})

;; token-id -> run stats
(define-map runs uint {
  maze-id: uint,
  minter: principal,
  time-ms: uint,
  attempts: uint,
  path-svg: (string-ascii 4096),
  ipfs-uri: (string-ascii 256)
})

;; SIP-009 Functions
(define-read-only (get-last-token-id)
  (ok (var-get last-token-id))
)

(define-read-only (get-token-uri (token-id uint))
  (let ((run (map-get? runs token-id)))
    (if (is-some run)
      (ok (some (get ipfs-uri (unwrap-panic run))))
      (ok none)
    )
  )
)

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? ham-run token-id))
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) err-not-token-owner)
    (nft-transfer? ham-run token-id sender recipient)
  )
)

;; Game Read-Only Functions

(define-read-only (get-prize-pool (maze-id uint))
  (default-to u0 (map-get? maze-prize-pools maze-id))
)

(define-read-only (is-maze-settled (maze-id uint))
  (default-to false (map-get? maze-settled maze-id))
)

(define-read-only (get-run-data (token-id uint))
  (map-get? runs token-id)
)

(define-read-only (get-daily-booster (maze-id uint))
  (map-get? daily-boosters maze-id)
)

;; Admin Functions

(define-public (set-server-pubkey (new-pubkey (buff 33)))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) err-owner-only)
    (ok (var-set server-pubkey new-pubkey))
  )
)

(define-public (toggle-pause)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) err-owner-only)
    (ok (var-set is-paused (not (var-get is-paused))))
  )
)

(define-public (set-mint-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) err-owner-only)
    (ok (var-set mint-fee new-fee))
  )
)

(define-public (set-daily-booster (maze-id uint) (booster-contract principal) (multiplier uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) err-owner-only)
    (ok (map-set daily-boosters maze-id {
      contract: booster-contract,
      multiplier: multiplier
    }))
  )
)

(define-data-var protocol-fee-balance uint u0)

(define-public (claim-admin-fees (amount uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) err-owner-only)
    (asserts! (<= amount (var-get protocol-fee-balance)) (err u400))
    (var-set protocol-fee-balance (- (var-get protocol-fee-balance) amount))
    (as-contract (stx-transfer? amount tx-sender (var-get contract-owner)))
  )
)

(define-read-only (get-protocol-fee-balance)
  (var-get protocol-fee-balance)
)

;; Core Game Functions

(define-read-only (hash-run (maze-id uint) (minter principal) (time-ms uint) (attempts uint) (path-svg (string-ascii 4096)) (ipfs-uri (string-ascii 256)))
  (sha256 (unwrap-panic (to-consensus-buff? {
    maze-id: maze-id,
    minter: minter,
    time-ms: time-ms,
    attempts: attempts,
    path-svg: path-svg,
    ipfs-uri: ipfs-uri
  })))
)

;; Mint a new run result NFT
(define-public (mint-run (maze-id uint) (time-ms uint) (attempts uint) (path-svg (string-ascii 4096)) (ipfs-uri (string-ascii 256)) (signature (buff 65)))
  (let
    (
      (token-id (+ (var-get last-token-id) u1))
      (msg-hash (hash-run maze-id tx-sender time-ms attempts path-svg ipfs-uri))
      (current-pool (get-prize-pool maze-id))
      (fee (var-get mint-fee))
    )
    (asserts! (not (var-get is-paused)) err-paused)
    (asserts! (not (is-maze-settled maze-id)) err-already-settled)
    (asserts! (secp256k1-verify msg-hash signature (var-get server-pubkey)) err-invalid-signature)
    (try! (stx-transfer? fee tx-sender (as-contract tx-sender)))
    (try! (nft-mint? ham-run token-id tx-sender))
    
    ;; Store the run data fully on-chain
    (map-set runs token-id {
      maze-id: maze-id,
      minter: tx-sender,
      time-ms: time-ms,
      attempts: attempts,
      path-svg: path-svg,
      ipfs-uri: ipfs-uri
    })
    
    (var-set last-token-id token-id)
    (map-set maze-prize-pools maze-id (+ current-pool fee))
    (ok token-id)
  )
)

;; Sponsor a maze pot
(define-public (sponsor-maze (maze-id uint) (amount uint))
  (let
    (
      (current-pool (get-prize-pool maze-id))
    )
    (asserts! (not (var-get is-paused)) err-paused)
    (asserts! (not (is-maze-settled maze-id)) err-already-settled)
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (map-set maze-prize-pools maze-id (+ current-pool amount))
    (ok true)
  )
)

;; Settlement Helpers

(define-read-only (hash-settlement (maze-id uint) (winners (list 10 principal)))
  (sha256 (unwrap-panic (to-consensus-buff? { maze-id: maze-id, winners: winners })))
)

(define-private (pay-winner (winner principal) (context { rank: uint, distribution-pool: uint }))
  (let
    (
      (rank (get rank context))
      (distribution-pool (get distribution-pool context))
      ;; Tiered payout structure
      ;; 1st: 35%, 2nd: 20%, 3rd: 10%, 4th-10th: 5%
      (share-percent (if (is-eq rank u1) u35
                     (if (is-eq rank u2) u20
                     (if (is-eq rank u3) u10
                     u5))))
      (share (/ (* distribution-pool share-percent) u100))
    )
    (if (> share u0)
      (begin
        ;; unwrap-panic forces a strict reversion if the transfer fails
        (unwrap-panic (as-contract (stx-transfer? share tx-sender winner)))
        { rank: (+ rank u1), distribution-pool: distribution-pool }
      )
      { rank: (+ rank u1), distribution-pool: distribution-pool }
    )
  )
)

;; Settle the maze via ECDSA
(define-public (settle-maze (maze-id uint) (winners (list 10 principal)) (signature (buff 65)))
  (let
    (
      (current-pool (get-prize-pool maze-id))
      (is-settled (is-maze-settled maze-id))
      ;; Distribute 75% of the pool
      (distribution-pool (/ (* current-pool u75) u100))
      (msg-hash (hash-settlement maze-id winners))
    )
    (asserts! (not (var-get is-paused)) err-paused)
    (asserts! (secp256k1-verify msg-hash signature (var-get server-pubkey)) err-invalid-signature)
    (asserts! (not is-settled) err-already-settled)
    (asserts! (is-eq (len winners) u10) err-invalid-winners)
    
    ;; Fold over winners to pay them by rank
    (fold pay-winner winners { rank: u1, distribution-pool: distribution-pool })
    
    (var-set protocol-fee-balance (+ (var-get protocol-fee-balance) (- current-pool distribution-pool)))
    ;; Prevent double counting of prize pools in the map
    (map-set maze-prize-pools maze-id u0)
    (map-set maze-settled maze-id true)
    (ok true)
  )
)
