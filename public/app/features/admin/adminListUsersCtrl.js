define([
  'angular',
],
function (angular) {
  'use strict';

  var module = angular.module('grafana.controllers');

  module.controller('AdminListUsersCtrl', function($scope, backendSrv) {

    $scope.init = function() {
      $scope.getUsers();
    };

    $scope.getUsers = function() {
      backendSrv.get('/api/users').then(function(users) {
        $scope.users = users;
      });
    };

    $scope.openInviteModal = function() {
      var modalScope = $scope.$new();
      modalScope.invitesSent = function() {
        $scope.get();
      };

      $scope.appEvent('show-modal', {
        src: './app/features/org/partials/invite.html',
        modalClass: 'modal-no-header invite-modal',
        scope: modalScope
      });
    };

    $scope.deleteUser = function(user) {
      $scope.appEvent('confirm-modal', {
        title: 'Do you want to delete ' + user.login + '?',
        icon: 'fa-trash',
        yesText: 'Delete',
        onConfirm: function() {
          backendSrv.delete('/api/admin/users/' + user.id).then(function() {
            $scope.getUsers();
          });
        }
      });
    };

    $scope.init();

  });
});
