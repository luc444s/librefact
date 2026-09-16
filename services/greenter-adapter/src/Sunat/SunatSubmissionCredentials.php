<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Sunat;

use Greenter\Ws\Services\SunatEndpoints;

final class SunatSubmissionCredentials
{
    /** @var string */
    private $ruc;

    /** @var string */
    private $solUser;

    /** @var string */
    private $solPassword;

    /** @var string */
    private $endpoint;

    public function __construct(string $ruc, string $solUser, string $solPassword, string $endpoint = SunatEndpoints::FE_BETA)
    {
        $this->ruc = $ruc;
        $this->solUser = $solUser;
        $this->solPassword = $solPassword;
        $this->endpoint = $endpoint;
    }

    public function soapUser(): string
    {
        return $this->ruc . $this->solUser;
    }

    public function solPassword(): string
    {
        return $this->solPassword;
    }

    public function endpoint(): string
    {
        return $this->endpoint;
    }
}
